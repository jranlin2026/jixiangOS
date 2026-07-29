import assert from 'node:assert/strict';
import { createEnterpriseAiAssistantService } from './aiAssistantService';
import { createMemoryEnterpriseAiRepository } from './aiRepository';
import type { AuthenticatedUser } from '../../../src/types/auth';
import { PERMISSION_KEYS } from '../../../src/shared/utils/permissions';

const user = (id: string): AuthenticatedUser => ({
  id, name: id, account: id, email: '', phone: '', role: '销售顾问', departmentId: 'dept-sales-one',
  positionId: 'pos-sales-consultant', positionName: '销售顾问', isActive: true,
  permissions: [{ module: PERMISSION_KEYS.AI_POSITION_ASSISTANT, actions: ['read'] }],
});

const repository = createMemoryEnterpriseAiRepository();
let modelCalls = 0;
const service = createEnterpriseAiAssistantService({
  repository,
  searchKnowledge: async () => [],
  complete: async () => { modelCalls += 1; return '不应调用'; },
  now: () => new Date('2026-07-29T10:00:00.000Z'),
});

const answer = await service.ask({ question: '客户说AI没用怎么办？' }, user('sales-1'));
assert.equal(answer.code, 0);
assert.equal(answer.data?.outcome, 'NO_EVIDENCE');
assert.match(answer.data?.answer || '', /暂无足够的已发布公司标准/);
assert.equal(modelCalls, 0, '无依据时不得调用模型生成公司事实');

const conversationId = answer.data!.conversationId;
assert.equal((await service.getConversation(conversationId, user('sales-1'))).code, 0);
assert.equal((await service.getConversation(conversationId, user('sales-2'))).code, 404, 'AI会话必须按用户隔离');
assert.equal(repository.inspect().gaps.length, 1, '无依据问题自动形成知识缺口');
assert.equal(repository.inspect().audits[0]?.userId, 'sales-1');

const citedRepository = createMemoryEnterpriseAiRepository();
let evidencePrompt = '';
const citedService = createEnterpriseAiAssistantService({
  repository: citedRepository,
  searchKnowledge: async () => [{ documentId: 'doc-1', versionId: 'knowledge-v3', title: '退款处理规范', excerpt: '退款事项必须由负责人确认。', score: 1, versionNumber: 3, updatedAt: '2026-07-29T08:00:00.000Z' }],
  complete: async (messages) => { evidencePrompt = messages.map((message) => message.content).join('\n'); return '请先收集退款原因并提交负责人确认。[1]'; },
});
const cited = await citedService.ask({ question: '客户要求退款怎么办？' }, user('sales-1'));
assert.equal(cited.data?.outcome, 'ANSWERED');
assert.equal(cited.data?.citations[0]?.versionId, 'knowledge-v3');
assert.match(evidencePrompt, /退款处理规范 V3/);
assert.match(cited.data?.answer || '', /高风险事项提示/);
assert.equal(citedRepository.inspect().audits[0]?.citationCount, 1);
await citedService.ask({ conversationId: cited.data!.conversationId, question: '那下一步呢？' }, user('sales-1'));
assert.match(evidencePrompt, /请先收集退款原因并提交负责人确认/, '连续追问必须携带最近会话上下文');

console.log('enterprise AI isolation and no-evidence tests passed');
