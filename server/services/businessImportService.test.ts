import assert from 'node:assert/strict';
import { createBusinessImportService, BusinessImportError } from './businessImportService';

const actor = {
  id: 'u-importer', name: '导入员', account: 'importer', isActive: true,
  permissions: [
    { module: '订单/订单列表/导入订单', actions: ['read', 'write'] },
    { module: '售后服务/售后挽回订单列表/导入售后挽回订单', actions: ['read', 'write'] },
  ],
} as any;

const baseDirectory = {
  products: [{ id: 'p-1', name: '训练营', level: '课程' }],
  orderTypes: [{ id: 'ot-1', name: '新购' }],
  paymentChannels: ['企业微信转账'],
  users: [{ id: 'u-sales', name: '销售甲' }, { id: 'u-importer', name: '导入员' }],
  recoveryPlatforms: [{ id: 'platform-1', name: '抖音' }],
  recoveryShops: [{ id: 'shop-1', platformId: 'platform-1', name: '旗舰店' }],
  customerMatchesByContact: new Map([
    ['phone:+8613800000000', [{ id: 'customer-1', name: '客户甲', inScope: true }]],
  ]),
  existingOrderNumbers: new Set<string>(),
  existingRecoveryOrderNumbers: new Set<string>(),
};

const persisted: any[] = [];
const jobs: any[] = [];
const attachmentValidationCalls: any[] = [];
const service = createBusinessImportService({
  secret: 'business-import-test-signing-secret',
  now: () => new Date('2026-07-24T00:00:00.000Z'),
  loadDirectory: async () => structuredClone(baseDirectory),
  persistPrecheck: async (record) => { persisted.push(record); },
  validateAttachments: async (user, type, rows) => { attachmentValidationCalls.push({ user, type, rows }); },
  consumePrecheckAndCreateJob: async (input) => {
    const precheck = persisted.find((item) => item.tokenHash === input.tokenHash);
    if (!precheck || precheck.consumedAt) throw new BusinessImportError('导入预检凭证无效或已使用', 409);
    precheck.consumedAt = '2026-07-24T00:00:00.000Z';
    const job = { id: `job-${jobs.length + 1}`, batchId: `batch-${jobs.length + 1}`, status: 'queued' as const, type: input.type, totalCount: input.rows.length, rows: input.rows, mode: input.mode };
    jobs.push(job);
    return job;
  },
});

const orderRow = {
  rowNumber: 2, customerName: '客户甲', customerPhone: '13800000000', customerWechat: '', productName: '训练营', orderType: '新购',
  paymentChannel: '企业微信转账', paymentAmount: '1999', paidAt: '2026-07-23', paymentOrderNo: 'PAY-1', salesUserName: '销售甲', creatorName: '导入员', notes: '', thirdPartyOrderNo: 'TP-1', remark: '',
};

const precheck = await service.precheck({ type: 'orders', rows: [orderRow] }, actor);
assert.equal(precheck.readyCount, 1);
assert.equal(precheck.blockedCount, 0);
assert.equal(persisted.length, 1, 'precheck must be persisted before confirmation');

const confirmed = await service.confirm({ type: 'orders', rows: [orderRow], confirmationToken: precheck.confirmationToken, fileName: 'orders.xlsx' }, actor);
assert.equal(confirmed.status, 'queued');
assert.equal(confirmed.totalCount, 1);
assert.equal(confirmed.batchId, 'batch-1', 'confirm must immediately return the review-navigation batch id');
assert.equal(jobs[0].rows[0].customerId, 'customer-1', 'order imports bind a unique active customer at precheck/confirm time');

const imageOrderRow = {
  ...orderRow,
  rowNumber: 6,
  thirdPartyOrderNo: 'TP-IMAGE',
  paymentProofFileName: '付款001.jpg',
  dealEvidenceFileNames: '聊天01.png;聊天02.webp',
};
const imagePrecheck = await service.precheck({ type: 'orders', rows: [imageOrderRow] }, actor);
assert.equal(imagePrecheck.readyCount, 1, '预检依据文件名校验，不要求图片已提前上传');
await assert.rejects(
  () => service.confirm({ type: 'orders', rows: [imageOrderRow], confirmationToken: imagePrecheck.confirmationToken, fileName: 'orders.zip' }, actor),
  /付款截图.*上传结果不完整/,
  '确认导入前必须上传 ZIP 中引用的全部图片',
);
const imageConfirmed = await service.confirm({
  type: 'orders',
  rows: [{
    ...imageOrderRow,
    paymentProofAttachmentIds: ['attachment-payment'],
    dealEvidenceAttachmentIds: ['attachment-deal-1', 'attachment-deal-2'],
  }],
  confirmationToken: imagePrecheck.confirmationToken,
  fileName: 'orders.zip',
}, actor);
assert.equal(imageConfirmed.status, 'queued');
assert.equal(attachmentValidationCalls.length, 1, '只有确认阶段需要从私有存储校验附件真实性与归属');
assert.deepEqual(jobs[jobs.length - 1].rows[0].normalized.paymentProofAttachmentIds, ['attachment-payment']);

const namedPrecheck = await service.precheck({ type: 'orders', rows: [{ ...orderRow, rowNumber: 8, thirdPartyOrderNo: 'TP-file-name' }] }, actor);
await assert.rejects(
  () => service.confirm({ type: 'orders', rows: [{ ...orderRow, rowNumber: 8, thirdPartyOrderNo: 'TP-file-name' }], confirmationToken: namedPrecheck.confirmationToken, fileName: '' }, actor),
  /导入文件名不能为空/,
  'confirmation records the selected source filename and rejects a missing contract value',
);

await assert.rejects(
  () => service.confirm({ type: 'orders', rows: [orderRow], confirmationToken: precheck.confirmationToken, fileName: 'orders.xlsx' }, actor),
  (error: unknown) => error instanceof BusinessImportError && error.status === 409,
  'the same signed precheck can only create one persistent job',
);

await assert.rejects(
  () => service.precheck({ type: 'orders', rows: [
    { ...orderRow, rowNumber: 21, thirdPartyOrderNo: 'TP-row-a' },
    { ...orderRow, rowNumber: 21, thirdPartyOrderNo: 'TP-row-b' },
  ] }, actor),
  (error: unknown) => error instanceof BusinessImportError && error.status === 400 && /rowNumber|行号/.test(error.message),
  '服务层在写入 job item 唯一约束前拒绝重复行号',
);
await assert.rejects(
  () => service.precheck({ type: 'orders', rows: [{ ...orderRow, rowNumber: 2_147_483_647, thirdPartyOrderNo: 'TP-row-overflow' }] }, actor),
  (error: unknown) => error instanceof BusinessImportError && error.status === 400 && /行号/.test(error.message),
  '服务层拒绝可使迁移或数据库 INT 溢出的极端行号',
);

const ambiguous = await service.precheck({
  type: 'orders',
  rows: [
    { ...orderRow, rowNumber: 3, thirdPartyOrderNo: 'TP-2' },
    { ...orderRow, rowNumber: 4, thirdPartyOrderNo: 'TP-2' },
  ],
}, actor);
assert.equal(ambiguous.rows[1]?.status, 'blocked', 'duplicate business numbers are blocked before a job is queued');

const recovery = await service.precheck({
  type: 'recovery_orders',
  rows: [{
    rowNumber: 2, customerName: '陌生客户', customerPhone: '13900000000', customerWechat: '', originalProduct: '历史产品',
    sourcePlatform: '', sourceShop: '', paymentChannel: '', originalAmount: '', paymentOrderNo: '', paymentAt: '', assistUserName: '', creatorName: '',
    recoveryAmount: '999', recoveryAt: '2026-07-23', recoveryUserName: '销售甲', thirdPartyOrderNo: 'REC-1', remark: '',
  }],
}, actor);
assert.equal(recovery.warningCount, 1, 'unmatched recovery contacts are explicitly warned and become temporary customers only during later execution');
assert.equal(recovery.rows[0]?.status, 'warning');
assert.equal(recovery.readyCount, 1, 'warnings are eligible for later review/job creation');

const invalidRecoveryPhone = await service.precheck({ type: 'recovery_orders', rows: [{
  rowNumber: 18, customerName: '非法号码客户', customerPhone: '12345', customerWechat: '', originalProduct: '历史产品',
  sourcePlatform: '', sourceShop: '', paymentChannel: '', originalAmount: '', paymentOrderNo: '', paymentAt: '', assistUserName: '', creatorName: '',
  recoveryAmount: '999', recoveryAt: '2026-07-23', recoveryUserName: '销售甲', thirdPartyOrderNo: 'REC-INVALID-PHONE', remark: '',
}] }, actor);
assert.equal(invalidRecoveryPhone.rows[0]?.status, 'blocked', '非法手机号必须在预检阶段阻止，不能留到后台任务失败');
assert.match(invalidRecoveryPhone.rows[0]?.reason || '', /手机号/);

const optionalOrderNumber = await service.precheck({ type: 'orders', rows: [{ ...orderRow, rowNumber: 9, thirdPartyOrderNo: '' }] }, actor);
assert.equal(optionalOrderNumber.readyCount, 1, 'order third-party order number is optional');

const optionalOrderMetadata = await service.precheck({ type: 'orders', rows: [{ ...orderRow, rowNumber: 10, thirdPartyOrderNo: '', paymentOrderNo: '', creatorName: '' }] }, actor);
assert.equal(optionalOrderMetadata.readyCount, 1, 'order payment order number and creator are optional');

const missingRecoveryNumber = await service.precheck({ type: 'recovery_orders', rows: [{ ...recovery.rows[0], ...({
  rowNumber: 3, customerName: '陌生客户', customerPhone: '13900000001', customerWechat: '', originalProduct: '历史产品', sourcePlatform: '', sourceShop: '', paymentChannel: '', originalAmount: '', paymentOrderNo: '', paymentAt: '', assistUserName: '', creatorName: '', recoveryAmount: '999', recoveryAt: '2026-07-23', recoveryUserName: '销售甲', thirdPartyOrderNo: '', remark: '',
} as any) }] }, actor);
assert.equal(missingRecoveryNumber.rows[0]?.status, 'blocked', 'recovery third-party order number is required');

const blockedPrecheck = await service.precheck({ type: 'orders', rows: [{ ...orderRow, rowNumber: 11, thirdPartyOrderNo: 'TP-blocked', productName: '不存在产品' }] }, actor);
await assert.rejects(
  () => service.confirm({ type: 'orders', rows: [{ ...orderRow, rowNumber: 11, thirdPartyOrderNo: 'TP-blocked', productName: '不存在产品' }], confirmationToken: blockedPrecheck.confirmationToken, fileName: 'blocked.xlsx' }, actor),
  (error: unknown) => error instanceof BusinessImportError && error.status === 409,
  'confirm must not enqueue a precheck that contains blocked rows',
);

const mixedRows = [
  { ...orderRow, rowNumber: 31, thirdPartyOrderNo: 'TP-READY' },
  { ...orderRow, rowNumber: 32, thirdPartyOrderNo: 'TP-BLOCKED', productName: '不存在产品' },
];
const mixedPrecheck = await service.precheck({ type: 'orders', rows: mixedRows }, actor);
await assert.rejects(
  () => service.confirm({ type: 'orders', rows: mixedRows, confirmationToken: mixedPrecheck.confirmationToken, fileName: 'mixed.xlsx' }, actor),
  (error: unknown) => error instanceof BusinessImportError && error.status === 409,
  'legacy callers keep the all-or-nothing confirmation behavior',
);
const mixedConfirmed = await service.confirm({
  type: 'orders', rows: mixedRows, confirmationToken: mixedPrecheck.confirmationToken, fileName: 'mixed.xlsx', mode: 'eligible_only',
}, actor);
assert.equal(mixedConfirmed.status, 'queued');
assert.equal(jobs[jobs.length - 1].mode, 'eligible_only');
assert.deepEqual(jobs[jobs.length - 1].rows.map((item: any) => item.status), ['ready', 'blocked'], 'persistence receives the complete revalidated workbook');

const mixedImageRows = [
  {
    ...imageOrderRow, rowNumber: 41, thirdPartyOrderNo: 'TP-IMAGE-READY',
    paymentProofAttachmentIds: ['attachment-payment-ready'],
    dealEvidenceAttachmentIds: ['attachment-deal-ready-1', 'attachment-deal-ready-2'],
  },
  {
    ...imageOrderRow, rowNumber: 42, thirdPartyOrderNo: 'TP-IMAGE-BLOCKED', productName: '不存在产品',
  },
];
const mixedImagePrecheck = await service.precheck({ type: 'orders', rows: mixedImageRows }, actor);
await service.confirm({
  type: 'orders', rows: mixedImageRows, confirmationToken: mixedImagePrecheck.confirmationToken, fileName: 'mixed-images.zip', mode: 'eligible_only',
}, actor);
assert.deepEqual(
  attachmentValidationCalls[attachmentValidationCalls.length - 1].rows.map((item: any) => item.rowNumber),
  [41],
  'only eligible rows require uploaded attachment validation',
);

const allBlockedPrecheck = await service.precheck({ type: 'orders', rows: [{ ...orderRow, rowNumber: 43, productName: '不存在产品' }] }, actor);
await assert.rejects(
  () => service.confirm({
    type: 'orders', rows: [{ ...orderRow, rowNumber: 43, productName: '不存在产品' }],
    confirmationToken: allBlockedPrecheck.confirmationToken, fileName: 'all-blocked.xlsx', mode: 'eligible_only',
  }, actor),
  (error: unknown) => error instanceof BusinessImportError && error.status === 400 && /没有可导入的数据/.test(error.message),
);

const changedConfig = await service.precheck({ type: 'orders', rows: [{ ...orderRow, rowNumber: 12, thirdPartyOrderNo: 'TP-config' }] }, actor);
baseDirectory.paymentChannels = [];
await assert.rejects(
  () => service.confirm({ type: 'orders', rows: [{ ...orderRow, rowNumber: 12, thirdPartyOrderNo: 'TP-config' }], confirmationToken: changedConfig.confirmationToken, fileName: 'config.xlsx' }, actor),
  (error: unknown) => error instanceof BusinessImportError && error.status === 409,
  'confirm revalidates current configuration and refuses newly blocked rows',
);
baseDirectory.paymentChannels = ['企业微信转账'];

const changedRows = await service.precheck({ type: 'orders', rows: [{ ...orderRow, rowNumber: 13, thirdPartyOrderNo: 'TP-hash' }] }, actor);
await assert.rejects(
  () => service.confirm({ type: 'orders', rows: [{ ...orderRow, rowNumber: 13, thirdPartyOrderNo: 'TP-hash', paymentAmount: '2000' }], confirmationToken: changedRows.confirmationToken, fileName: 'changed.xlsx' }, actor),
  (error: unknown) => error instanceof BusinessImportError && error.status === 409,
  'changed normalized rows invalidate the signed precheck hash',
);
await assert.rejects(
  () => service.confirm({ type: 'orders', rows: [{ ...orderRow, rowNumber: 13, thirdPartyOrderNo: 'TP-hash' }], confirmationToken: changedRows.confirmationToken, fileName: 'actor.xlsx' }, { ...actor, id: 'other-user' }),
  (error: unknown) => error instanceof BusinessImportError && error.status === 409,
  'a signed precheck cannot be confirmed by another actor',
);

baseDirectory.customerMatchesByContact.set('phone:+8613900000002', [{ id: 'customer-outside', name: '范围外客户', inScope: false }]);
const outOfScopeRecovery = await service.precheck({ type: 'recovery_orders', rows: [{
  rowNumber: 14, customerName: '范围外客户', customerPhone: '13900000002', customerWechat: '', originalProduct: '', sourcePlatform: '', sourceShop: '', paymentChannel: '', originalAmount: '', paymentOrderNo: '', paymentAt: '', recoveryAmount: '1', recoveryAt: '2026-07-23', recoveryUserName: '销售甲', assistUserName: '', creatorName: '', thirdPartyOrderNo: 'REC-scope', remark: '',
}] }, actor);
assert.notEqual(outOfScopeRecovery.rows[0]?.status, 'blocked', '售后导入只做后台盲匹配，不应因客户不在售后数据范围而泄露或阻止');
assert.equal(outOfScopeRecovery.rows[0]?.reason, '已完成后台身份识别');
baseDirectory.customerMatchesByContact.set('phone:+8613900000003', [{ id: 'customer-a', name: '客户甲', inScope: true }, { id: 'customer-b', name: '客户乙', inScope: true }]);
const ambiguousRecovery = await service.precheck({ type: 'recovery_orders', rows: [{
  rowNumber: 15, customerName: '冲突客户', customerPhone: '13900000003', customerWechat: '', originalProduct: '', sourcePlatform: '', sourceShop: '', paymentChannel: '', originalAmount: '', paymentOrderNo: '', paymentAt: '', recoveryAmount: '1', recoveryAt: '2026-07-23', recoveryUserName: '销售甲', assistUserName: '', creatorName: '', thirdPartyOrderNo: 'REC-ambiguous', remark: '',
}] }, actor);
assert.equal(ambiguousRecovery.rows[0]?.status, 'blocked', 'conflicting recovery matches cannot silently bind or create a temporary customer');
const invalidRecoveryPeople = await service.precheck({ type: 'recovery_orders', rows: [{
  rowNumber: 16, customerName: '陌生客户', customerPhone: '13900000004', customerWechat: '', originalProduct: '', sourcePlatform: '', sourceShop: '', paymentChannel: '', originalAmount: '', paymentOrderNo: '', paymentAt: '', recoveryAmount: '1', recoveryAt: '2026-07-23', recoveryUserName: '销售甲', assistUserName: '不存在', creatorName: '不存在', thirdPartyOrderNo: 'REC-people', remark: '',
}] }, actor);
assert.equal(invalidRecoveryPeople.rows[0]?.status, 'blocked', 'optional supplied recovery assistant/creator must be active and in scope');
const oversizedRecoveryIdentity = await service.precheck({ type: 'recovery_orders', rows: [{
  rowNumber: 17, customerName: '客'.repeat(121), customerPhone: '13900000005', customerWechat: '', originalProduct: '', sourcePlatform: '', sourceShop: '', paymentChannel: '', originalAmount: '', paymentOrderNo: '', paymentAt: '', recoveryAmount: '1', recoveryAt: '2026-07-23', recoveryUserName: '销售甲', assistUserName: '', creatorName: '', thirdPartyOrderNo: 'REC-long-name', remark: '',
}] }, actor);
assert.equal(oversizedRecoveryIdentity.rows[0]?.status, 'blocked', '导入预检应拦截无法写入 LeadRecord 的超长身份字段');
assert.match(oversizedRecoveryIdentity.rows[0]?.reason || '', /120/);

console.log('business import service: ok');
