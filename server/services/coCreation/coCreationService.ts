import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '../../../src/types/auth';
import { hasPermission, PERMISSION_KEYS } from '../../../src/shared/utils/permissions';
import { failure, success } from '../../api/response';
import type { AiChatClient } from '../aiChatClient';
import { buildInterviewMessages, parseInterviewTurn } from './interviewEngine';

type PrismaLike = any;

function jsonArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function detailInclude() {
  return { messages: { orderBy: { createdAt: 'asc' } }, brief: true, validation: true, events: { orderBy: { createdAt: 'asc' } } };
}

export function createCoCreationService({ prisma, aiClient }: { prisma: PrismaLike; aiClient: AiChatClient }) {
  async function event(requestId: string, actor: AuthenticatedUser, action: string, fromState?: string, toState?: string, detail?: unknown) {
    await prisma.coCreationEvent.create({ data: {
      id: randomUUID(), requestId, actorId: actor.id, actorName: actor.name,
      action, fromState, toState, detail: detail ?? undefined,
    } });
  }

  async function load(id: string) {
    return prisma.coCreationRequest.findUnique({ where: { id }, include: detailInclude() });
  }

  function canSee(actor: AuthenticatedUser, request: any) {
    return request.requesterId === actor.id
      || hasPermission(actor, PERMISSION_KEYS.CO_CREATION_SUPERVISE)
      || hasPermission(actor, PERMISSION_KEYS.CO_CREATION_DECIDE)
      || hasPermission(actor, PERMISSION_KEYS.CO_CREATION_VALIDATE);
  }

  return {
    async createRequest(actor: AuthenticatedUser, input: { title?: string }) {
      if (!hasPermission(actor, PERMISSION_KEYS.CO_CREATION_SUBMIT, 'write')) return failure('Forbidden', 403);
      const title = String(input.title || '').trim();
      if (!title) return failure('请先用一句话描述你遇到的工作问题', 400);
      const id = randomUUID();
      const row = await prisma.coCreationRequest.create({ data: {
        id, title, status: 'DRAFT', requesterId: actor.id, requesterName: actor.name,
        departmentId: actor.departmentId || null,
      }, include: detailInclude() });
      const openingQuestion = `我先不急着讨论功能。请讲一个最近发生的真实工作场景：你当时在做什么，具体卡在哪里？\n\n你可以这样回答：我是【岗位】，在【时间/场景】需要【完成什么工作】，现在卡在【具体问题】。`;
      const openingMessage = await prisma.coCreationMessage.create({ data: {
        id: randomUUID(), requestId: id, role: 'ASSISTANT', content: openingQuestion,
        metadata: { phase: 'ROLE_SCENARIO', completeness: 0, extractedFacts: [], hypotheses: [], briefReady: false },
      } });
      await prisma.coCreationRequest.update({ where: { id }, data: { status: 'INTERVIEWING' } });
      await event(id, actor, 'CREATE_REQUEST', undefined, 'INTERVIEWING');
      return success({ ...row, status: 'INTERVIEWING', messages: [openingMessage] }, 'AI访谈已开始');
    },

    async listRequests(actor: AuthenticatedUser) {
      const elevated = hasPermission(actor, PERMISSION_KEYS.CO_CREATION_SUPERVISE)
        || hasPermission(actor, PERMISSION_KEYS.CO_CREATION_DECIDE)
        || hasPermission(actor, PERMISSION_KEYS.CO_CREATION_VALIDATE);
      const rows = await prisma.coCreationRequest.findMany({
        where: elevated ? {} : { requesterId: actor.id },
        include: { brief: true, validation: true }, orderBy: { updatedAt: 'desc' },
      });
      return success(rows);
    },

    async getRequest(actor: AuthenticatedUser, id: string) {
      const row = await load(id);
      if (!row) return failure('需求不存在', 404);
      if (!canSee(actor, row)) return failure('Forbidden', 403);
      return success(row);
    },

    async continueInterview(actor: AuthenticatedUser, id: string, answer: string) {
      const row = await load(id);
      if (!row) return failure('需求不存在', 404);
      if (row.requesterId !== actor.id) return failure('只有提出人可以继续访谈', 403);
      if (!['DRAFT', 'INTERVIEWING'].includes(row.status)) return failure('当前状态不能继续访谈', 409);
      const content = String(answer || '').trim();
      if (!content) return failure('请回答当前问题', 400);
      await prisma.coCreationMessage.create({ data: { id: randomUUID(), requestId: id, role: 'USER', content } });
      const history = [...(row.messages || []), { role: 'USER', content }]
        .map((message: any) => ({ role: message.role === 'ASSISTANT' ? 'assistant' as const : 'user' as const, content: message.content }));
      const raw = await aiClient.complete(buildInterviewMessages({ title: row.title, messages: history }), { temperature: 0.2 });
      const turn = parseInterviewTurn(raw);
      await prisma.coCreationMessage.create({ data: {
        id: randomUUID(), requestId: id, role: 'ASSISTANT', content: turn.reply,
        metadata: { phase: turn.phase, completeness: turn.completeness, extractedFacts: turn.extractedFacts, hypotheses: turn.hypotheses, briefReady: turn.briefReady },
      } });
      const statements = history.filter((message) => message.role === 'user').map((message) => message.content);
      const priorFacts = (row.messages || []).flatMap((message: any) => jsonArray(message.metadata?.extractedFacts));
      const priorHypotheses = (row.messages || []).flatMap((message: any) => jsonArray(message.metadata?.hypotheses));
      const briefData = {
        problemStatement: statements[0] || row.title,
        currentWorkflow: statements.slice(1, 3).join('\n') || '待继续访谈',
        painPoints: statements.slice(0, 3), affectedRoles: [],
        frequency: null, impact: null,
        desiredOutcome: statements[statements.length - 1] || '待继续访谈', acceptanceCriteria: [], evidence: [],
        employeeStatements: statements,
        aiHypotheses: [...priorHypotheses, ...turn.hypotheses],
        confirmedFacts: [], openQuestions: [turn.reply],
        completeness: turn.completeness,
      };
      await prisma.coCreationBrief.upsert({ where: { requestId: id }, update: briefData, create: { id: randomUUID(), requestId: id, ...briefData } });
      const nextStatus = turn.briefReady || turn.completeness >= 80 ? 'EMPLOYEE_CONFIRMATION' : 'INTERVIEWING';
      await prisma.coCreationRequest.update({ where: { id }, data: { status: nextStatus } });
      await event(id, actor, 'INTERVIEW_TURN', row.status, nextStatus, { phase: turn.phase, completeness: turn.completeness });
      return success(turn);
    },

    async confirmBrief(actor: AuthenticatedUser, id: string) {
      const row = await load(id);
      if (!row || row.requesterId !== actor.id) return failure('需求不存在或无权操作', 404);
      if (!['INTERVIEWING', 'EMPLOYEE_CONFIRMATION'].includes(row.status)) return failure('当前状态不能确认简报', 409);
      await prisma.coCreationBrief.update({ where: { requestId: id }, data: { employeeConfirmedAt: new Date() } });
      await prisma.coCreationRequest.update({ where: { id }, data: { status: 'FACT_CONFIRMATION' } });
      await event(id, actor, 'EMPLOYEE_CONFIRM_BRIEF', row.status, 'FACT_CONFIRMATION');
      return success(true, '已提交主管确认');
    },

    async confirmFacts(actor: AuthenticatedUser, id: string, input: { confirmed: boolean; comment?: string }) {
      if (!hasPermission(actor, PERMISSION_KEYS.CO_CREATION_SUPERVISE, 'write')) return failure('Forbidden', 403);
      const row = await load(id);
      if (!row) return failure('需求不存在', 404);
      if (row.status !== 'FACT_CONFIRMATION') return failure('当前状态不能确认事实', 409);
      const next = input.confirmed ? 'MANAGEMENT_REVIEW' : 'INTERVIEWING';
      if (input.confirmed) await prisma.coCreationBrief.update({ where: { requestId: id }, data: {
        factsConfirmedAt: new Date(), factsConfirmedBy: actor.id,
        confirmedFacts: row.brief?.employeeStatements || [], openQuestions: input.comment ? [input.comment] : [],
      } });
      await prisma.coCreationRequest.update({ where: { id }, data: { status: next, decisionReason: input.comment || null } });
      await event(id, actor, input.confirmed ? 'CONFIRM_FACTS' : 'RETURN_FACTS', row.status, next, { comment: input.comment });
      return success(true, input.confirmed ? '事实已确认，进入管理初审' : '已退回员工补充');
    },

    async decideValidation(actor: AuthenticatedUser, id: string, input: { decision: 'APPROVE_VALIDATION' | 'DEFER' | 'MERGE' | 'REJECT'; reason: string; mergedIntoId?: string }) {
      if (!hasPermission(actor, PERMISSION_KEYS.CO_CREATION_DECIDE, 'write')) return failure('Forbidden', 403);
      const row = await load(id);
      if (!row) return failure('需求不存在', 404);
      if (row.status !== 'MANAGEMENT_REVIEW') return failure('当前状态不能进行管理初审', 409);
      const reason = String(input.reason || '').trim();
      if (!reason) return failure('请填写决策原因', 400);
      const next = input.decision === 'APPROVE_VALIDATION' ? 'VALIDATION_APPROVED'
        : input.decision === 'DEFER' ? 'DEFERRED' : input.decision === 'MERGE' ? 'MERGED' : 'REJECTED';
      await prisma.coCreationRequest.update({ where: { id }, data: { status: next, decisionReason: reason, mergedIntoId: input.mergedIntoId || null } });
      if (next === 'VALIDATION_APPROVED') await prisma.coCreationValidation.upsert({
        where: { requestId: id }, update: {}, create: {
          id: randomUUID(), requestId: id,
          plan: ['访谈相关岗位', '抽查真实案例', '核对现有系统能力', '记录上线前基线指标'],
          evidence: [], confirmedFacts: [], metrics: [], unresolvedQuestions: [],
        },
      });
      await event(id, actor, input.decision, row.status, next, { reason });
      return success(true, next === 'VALIDATION_APPROVED' ? '已批准进入需求验证' : '管理初审已记录');
    },

    async saveValidation(actor: AuthenticatedUser, id: string, input: any) {
      if (!hasPermission(actor, PERMISSION_KEYS.CO_CREATION_VALIDATE, 'write')) return failure('Forbidden', 403);
      const row = await load(id);
      if (!row) return failure('需求不存在', 404);
      if (!['VALIDATION_APPROVED', 'VALIDATING', 'PROJECT_DECISION'].includes(row.status)) return failure('当前状态不能编辑验证', 409);
      const complete = input.complete === true;
      await prisma.coCreationValidation.upsert({ where: { requestId: id }, update: {
        plan: jsonArray(input.plan), evidence: jsonArray(input.evidence), confirmedFacts: jsonArray(input.confirmedFacts),
        metrics: jsonArray(input.metrics), unresolvedQuestions: jsonArray(input.unresolvedQuestions),
        recommendation: input.recommendation || null, conclusion: input.conclusion || null,
        startedAt: row.validation?.startedAt || new Date(), completedAt: complete ? new Date() : null,
      }, create: {
        id: randomUUID(), requestId: id, plan: jsonArray(input.plan), evidence: jsonArray(input.evidence),
        confirmedFacts: jsonArray(input.confirmedFacts), metrics: jsonArray(input.metrics),
        unresolvedQuestions: jsonArray(input.unresolvedQuestions), recommendation: input.recommendation || null,
        conclusion: input.conclusion || null, startedAt: new Date(), completedAt: complete ? new Date() : null,
      } });
      const next = complete ? 'PROJECT_DECISION' : 'VALIDATING';
      await prisma.coCreationRequest.update({ where: { id }, data: { status: next } });
      await event(id, actor, complete ? 'COMPLETE_VALIDATION' : 'SAVE_VALIDATION', row.status, next);
      return success(true, complete ? '验证已完成，等待立项决策' : '验证进度已保存');
    },
  };
}

export type CoCreationService = ReturnType<typeof createCoCreationService>;
