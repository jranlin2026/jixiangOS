import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const databaseUrl = new URL(String(process.env.DATABASE_URL || ''));
if (!['127.0.0.1', 'localhost', '::1'].includes(databaseUrl.hostname)) throw new Error('只允许初始化本地数据库');
if (process.env.JIXIANG_CONFIRM_LOCAL_ENTERPRISE_BRAIN_SEED !== 'YES') throw new Error('需要 JIXIANG_CONFIRM_LOCAL_ENTERPRISE_BRAIN_SEED=YES');

const prisma = new PrismaClient();
const actor = { id: 'local-trial-seed', name: '本地试运行初始化' };
const weekdays = [1, 2, 3, 4, 5];
const configs = [
  {
    positionId: 'pos-sales-consultant', title: '销售顾问岗位标准（本地试运行）',
    mission: '持续发现并理解客户真实需求，按照公司标准完成跟进、邀约、成交与客户信息沉淀。',
    goals: ['形成稳定、可追踪的销售过程', '提高有效沟通、邀约和成交转化', '让客户问题与一线经验进入企业知识系统'],
    dailyActions: ['完成当日客户跟进', '完成有效邀约', '及时更新CRM客户状态与下一步', '提交当日任务结果和复盘'],
    kpis: ['有效跟进量', '邀约量与邀约率', '成交量与成交金额', 'CRM信息完整率', '复盘提交率'],
    workflow: ['查看今日任务与客户优先级', '按标准话术完成沟通', '记录客户异议与下一步', '更新CRM', '提交任务结果和每日复盘'],
    speechTemplates: ['先确认客户真实顾虑，再依据当前有效公司知识回应；没有依据时不得自行承诺。'],
    faq: ['遇到未覆盖异议时，先通过AI岗位助手检索；无依据则登记知识缺口并请负责人确认。'],
    templates: [
      { key: 'follow-up', name: '完成客户跟进', description: '按客户优先级完成有效沟通并更新下一步；目标值由销售负责人确认后配置', targetValue: null, unit: '人', dueTime: '17:30', evidenceRequired: false },
      { key: 'invite', name: '完成客户邀约', description: '完成有效邀约并记录客户反馈；目标值由销售负责人确认后配置', targetValue: null, unit: '人', dueTime: '18:00', evidenceRequired: false },
      { key: 'crm', name: '更新CRM客户信息', description: '更新客户阶段、标签、沟通记录与下一步', targetValue: null, unit: null, dueTime: '18:30', evidenceRequired: false },
      { key: 'review', name: '提交每日复盘', description: '沉淀问题、案例、客户新需求和优化建议', targetValue: null, unit: null, dueTime: '19:00', evidenceRequired: true },
    ],
  },
  {
    positionId: 'pos-sales-manager', title: '销售经理岗位标准（本地试运行）',
    mission: '确保团队按照统一销售标准执行，及时发现过程阻塞并完成辅导、确认和改进。',
    goals: ['团队目标透明', '关键任务按日闭环', '高频异议和优秀打法持续沉淀'],
    dailyActions: ['确认团队当天目标', '查看团队任务进度与逾期项', '辅导关键客户和重点异议', '确认员工任务和复盘'],
    kpis: ['团队任务完成率', '团队成交与转化', '逾期任务数', '复盘提交率', 'SOP改进数量'],
    workflow: ['查看老板驾驶舱', '识别团队阻塞', '指派或调整任务', '辅导员工执行', '确认结果并沉淀标准建议'],
    speechTemplates: ['辅导时先对照当前标准和真实数据，再给出下一步动作与完成时限。'],
    faq: ['员工执行结果与标准冲突时，以当前生效版本为准，并把例外提交给标准负责人评估。'],
    templates: [
      { key: 'morning', name: '确认团队当日目标', description: '检查团队任务是否生成并明确重点客户', targetValue: null, unit: null, dueTime: '10:00', evidenceRequired: false },
      { key: 'coach', name: '检查并辅导风险任务', description: '处理逾期、退回和关键客户阻塞', targetValue: null, unit: null, dueTime: '17:00', evidenceRequired: false },
      { key: 'team-review', name: '确认团队执行与复盘', description: '确认已完成任务并查看团队复盘缺口', targetValue: null, unit: null, dueTime: '19:00', evidenceRequired: false },
    ],
  },
  {
    positionId: 'pos-sales-director', title: '销售总监岗位标准（本地试运行）',
    mission: '通过经营数据、岗位标准和团队执行反馈，持续提升销售体系的可复制性。',
    goals: ['经营结果与执行过程可对账', '销售漏斗问题可定位', '标准迭代有数据和案例依据'],
    dailyActions: ['查看经营与执行驾驶舱', '识别关键漏斗变化', '确定当日管理动作', '评估需要升级的标准与知识缺口'],
    kpis: ['成交金额', '关键环节转化率', '岗位标准覆盖率', '团队任务完成率', '复盘提交率'],
    workflow: ['查看结果', '定位过程', '核对人员与任务', '安排负责人处理', '验证结果并决定是否更新标准'],
    speechTemplates: ['管理判断必须区分事实、推断和待验证项，并给出责任人、动作和截止时间。'],
    faq: ['业务数据为空时先核对口径与数据接入，不把零数据直接解释为零业绩。'],
    templates: [
      { key: 'cockpit', name: '查看经营与执行驾驶舱', description: '核对经营结果、标准覆盖、任务完成和复盘提交', targetValue: null, unit: null, dueTime: '10:00', evidenceRequired: false },
      { key: 'decision', name: '处理关键经营阻塞', description: '明确阻塞、责任人、动作和截止时间', targetValue: null, unit: null, dueTime: '18:00', evidenceRequired: false },
    ],
  },
] as const;

function shanghaiDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

async function main() {
  const positions = new Set((await prisma.position.findMany({ where: { id: { in: configs.map((item) => item.positionId) }, isActive: true }, select: { id: true } })).map((item) => item.id));
  let standardsCreated = 0; let templatesCreated = 0;
  for (const config of configs.filter((item) => positions.has(item.positionId))) {
    let standard = await prisma.positionStandard.findUnique({ where: { positionId: config.positionId } });
    if (!standard) {
      const standardId = `position-standard-${config.positionId}`;
      const versionId = `position-standard-version-${config.positionId}-1`;
      standard = await prisma.positionStandard.create({ data: { id: standardId, positionId: config.positionId, title: config.title, currentVersionId: null, createdById: actor.id, createdByName: actor.name } });
      await prisma.positionStandardVersion.create({ data: { id: versionId, standardId, versionNumber: 1, status: 'CURRENT', title: config.title, mission: config.mission, goals: [...config.goals], dailyActions: [...config.dailyActions], kpis: [...config.kpis], workflow: [...config.workflow], speechTemplates: [...config.speechTemplates], faq: [...config.faq], effectiveAt: new Date(), publishedAt: new Date(), publishedById: actor.id, publishedByName: actor.name, createdById: actor.id, createdByName: actor.name } });
      standard = await prisma.positionStandard.update({ where: { id: standardId }, data: { currentVersionId: versionId } });
      standardsCreated += 1;
    }
    for (const item of config.templates) {
      const id = `task-template-${config.positionId}-${item.key}`;
      const exists = await prisma.taskTemplate.findUnique({ where: { id } });
      const data = { name: item.name, description: item.description, targetValue: item.targetValue, unit: item.unit, scheduleType: 'DAILY' as const, weekdays, dueTime: item.dueTime, evidenceRequired: item.evidenceRequired, isActive: true };
      if (exists) {
        await prisma.taskTemplate.update({ where: { id }, data });
        await prisma.employeeTask.updateMany({ where: { templateId: id, status: 'PENDING' }, data: { description: item.description, targetValue: item.targetValue, unit: item.unit } });
      } else {
        await prisma.taskTemplate.create({ data: { id, positionId: config.positionId, standardVersionId: standard.currentVersionId, ...data, createdById: actor.id, createdByName: actor.name } });
        templatesCreated += 1;
      }
    }
  }
  const date = shanghaiDate();
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const activeTemplates = await prisma.taskTemplate.findMany({ where: { isActive: true, weekdays: { array_contains: weekday } } });
  const employees = await prisma.user.findMany({ where: { isActive: true, employmentStatus: 'active', positionId: { in: activeTemplates.map((item) => item.positionId) } } });
  const departmentIds = Array.from(new Set(employees.flatMap((item) => item.departmentId ? [item.departmentId] : [])));
  const departments = new Map((await prisma.department.findMany({ where: { id: { in: departmentIds } }, select: { id: true, name: true } })).map((item) => [item.id, item.name]));
  const rows = activeTemplates.flatMap((template) => employees.filter((employee) => employee.positionId === template.positionId).map((employee) => ({ id: `task-${randomUUID()}`, templateId: template.id, sourceKey: `template:${template.id}:${employee.id}:${date}`, employeeId: employee.id, employeeName: employee.name, departmentIdSnapshot: employee.departmentId || null, departmentNameSnapshot: employee.departmentId ? departments.get(employee.departmentId) || null : null, positionIdSnapshot: employee.positionId || null, positionNameSnapshot: employee.positionName || null, standardVersionIdSnapshot: template.standardVersionId, workDate: new Date(`${date}T00:00:00Z`), title: template.name, description: template.description, targetValue: template.targetValue, unit: template.unit, evidenceRequired: template.evidenceRequired, dueAt: template.dueTime ? new Date(`${date}T${template.dueTime}:00+08:00`) : null })));
  const generated = rows.length ? await prisma.employeeTask.createMany({ data: rows, skipDuplicates: true }) : { count: 0 };
  console.log(JSON.stringify({ date, standardsCreated, templatesCreated, candidateTasks: rows.length, tasksCreated: generated.count }));
}

main().finally(() => prisma.$disconnect());
