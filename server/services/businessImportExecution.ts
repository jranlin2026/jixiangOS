import type { AuthenticatedUser } from '../../src/types/auth';
import type {
  BusinessImportJobExecution,
  BusinessImportJobRow,
  BusinessImportMetadata,
  OrderImportRow,
  RecoveryImportRow,
} from '../../src/types/businessImport';
import type { OrderApplication } from '../../src/types/order';
import type { RecoveryOrder, RecoveryOrderInput, RecoveryOrderMatchStatus } from '../../src/types/recoveryOrder';
import type { OfficialPaymentChannel } from '../../src/types/commission';
import type { PaymentMethod } from '../../src/types/common';
import type { BusinessAttachment } from '../../src/types/businessAttachment';
import { safeBusinessImportErrorMessage } from './businessImportError';

type DirectoryUser = { id: string; name: string };
type CustomerMatch = { id: string; name: string };

export type BusinessImportExecutionContext = {
  actor: Pick<AuthenticatedUser, 'id' | 'name'>;
  users: DirectoryUser[];
  products: Array<{ id: string; name: string; level?: string }>;
  orderTypes: Array<{ id: string; name: string }>;
  paymentChannels: string[];
  customerMatches: CustomerMatch[];
  recoveryPlatforms: Array<{ id: string; name: string }>;
  recoveryShops: Array<{ id: string; platformId: string; name: string }>;
};

type ImportedOrderInput = {
  idempotencyKey: string;
  applicant: Pick<AuthenticatedUser, 'id' | 'name'>;
  metadata: BusinessImportMetadata;
  orderData: OrderApplication['orderData'];
};

type ImportedRecoveryInput = {
  idempotencyKey: string;
  actor: Pick<AuthenticatedUser, 'id' | 'name'>;
  metadata: BusinessImportMetadata;
  row: BusinessImportJobRow;
  customer: { id: string; name: string; matchStatus: RecoveryOrderMatchStatus };
  data: RecoveryOrderInput;
};

export type BusinessImportRowExecutor = {
  execute(job: BusinessImportJobExecution, row: BusinessImportJobRow): Promise<{ recordId: string }>;
  releaseJob?(job: BusinessImportJobExecution): void | Promise<void>;
};

export type BusinessImportJobLease = BusinessImportJobExecution & {
  status: 'running';
  leaseOwner: string;
};

export type BusinessImportJobStore = {
  claim(input: { workerId: string; jobId?: string; now: Date; leaseMs: number }): Promise<BusinessImportJobLease | null>;
  heartbeat(lease: BusinessImportJobLease, leaseMs: number, now: Date): Promise<boolean>;
  nextRow(lease: BusinessImportJobLease): Promise<BusinessImportJobRow | null>;
  markSucceeded(lease: BusinessImportJobLease, rowNumber: number, recordId: string): Promise<boolean>;
  markFailed(lease: BusinessImportJobLease, rowNumber: number, message: string): Promise<boolean>;
  finalize(lease: BusinessImportJobLease): Promise<boolean>;
};

function clean(value: unknown): string { return String(value ?? '').trim(); }
function number(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error('导入金额无效');
  return parsed;
}
function paymentMethodFromOfficialChannel(channel: OfficialPaymentChannel): PaymentMethod {
  if (channel === '企业微信转账' || channel === '公司自营小店') return '微信支付';
  if (channel === '企业支付宝转账') return '支付宝';
  if (channel === '对公银行转账') return '对公转账';
  return '银行转账';
}
function uniqueByName(users: DirectoryUser[], name: string, label: string): DirectoryUser {
  const matches = users.filter((user) => user.name === name);
  if (matches.length !== 1) throw new Error(`${label}不存在、已停用或姓名不唯一`);
  return matches[0];
}
function metadata(job: BusinessImportJobExecution, row: BusinessImportJobRow, context: BusinessImportExecutionContext, target: DirectoryUser): BusinessImportMetadata {
  return {
    importBatchId: job.batchId,
    importRowNumber: row.rowNumber,
    importedById: context.actor.id,
    importedByName: context.actor.name,
    importedAt: new Date().toISOString(),
    targetCreatorId: target.id,
    targetCreatorName: target.name,
    ...(row.status === 'warning' && clean(row.reason) ? { importWarnings: [clean(row.reason)] } : {}),
  };
}

export function createBusinessImportRowExecutor(deps: {
  loadContext(job: BusinessImportJobExecution, row: BusinessImportJobRow): Promise<BusinessImportExecutionContext>;
  loadAttachments?(job: BusinessImportJobExecution, row: BusinessImportJobRow): Promise<{
    paymentProof: BusinessAttachment[];
    dealEvidence: BusinessAttachment[];
    recoveryEvidence: BusinessAttachment[];
  }>;
  submitImportedOrderApplication(input: ImportedOrderInput): Promise<{ id: string }>;
  createImportedRecoveryOrder(input: ImportedRecoveryInput): Promise<{ id: string }>;
}): BusinessImportRowExecutor {
  return {
    async execute(job, row) {
      if (row.status === 'blocked') throw new Error('预检未通过的数据不能执行');
      const context = await deps.loadContext(job, row);
      if (context.actor.id !== job.actorId) throw new Error('导入人不存在或已停用');
      const requestedCreator = clean(row.normalized.creatorName);
      const targetCreator = requestedCreator
        ? uniqueByName(context.users, requestedCreator, '目标创建人')
        : context.actor;
      const importMetadata = metadata(job, row, context, targetCreator);
      const idempotencyKey = `${job.id}:${row.rowNumber}`;
      const attachments = deps.loadAttachments
        ? await deps.loadAttachments(job, row)
        : { paymentProof: [], dealEvidence: [], recoveryEvidence: [] };

      if (job.type === 'orders') {
        const input = row.normalized as OrderImportRow;
        const customers = context.customerMatches;
        if (customers.length !== 1 || customers[0].id !== row.customerId) {
          throw new Error('客户匹配结果已变化，订单导入已停止');
        }
        const product = context.products.find((item) => item.name === clean(input.productName));
        if (!product) throw new Error('产品不存在或已停用');
        if (!context.orderTypes.some((item) => item.name === clean(input.orderType))) throw new Error('订单类型不存在或已停用');
        if (!context.paymentChannels.includes(clean(input.paymentChannel))) throw new Error('收款渠道已停用');
        const sales = uniqueByName(context.users, clean(input.salesUserName), '销售人员');
        const amount = number(input.paymentAmount);
        const officialPaymentChannel = clean(input.paymentChannel) as OfficialPaymentChannel;
        const paymentMethod = paymentMethodFromOfficialChannel(officialPaymentChannel);
        const result = await deps.submitImportedOrderApplication({
          idempotencyKey, applicant: context.actor, metadata: importMetadata,
          orderData: {
            customerId: customers[0].id, customerName: customers[0].name,
            productId: product.id, productName: product.name, productLevel: (product.level || '未分级') as any,
            orderType: clean(input.orderType) as any, amount, actualAmount: amount,
            paymentMethod, officialPaymentChannel, status: '已确认', refundStatus: '无',
            owner: sales.name, salesId: sales.id, salesName: sales.name,
            thirdPartyOrderNo: clean(input.thirdPartyOrderNo) || undefined,
            notes: clean(input.notes) || clean(input.remark) || undefined,
            dealEvidenceAttachments: attachments.dealEvidence,
            payments: [{
              id: `import-payment-${job.id}-${row.rowNumber}`, amount,
              paymentMethod, paidAt: clean(input.paidAt),
              paymentOrderNo: clean(input.paymentOrderNo) || undefined,
              attachments: attachments.paymentProof,
              remark: clean(input.remark) || undefined,
            }],
          },
        });
        return { recordId: result.id };
      }

      const input = row.normalized as RecoveryImportRow;
      if (context.customerMatches.length > 1) throw new Error('客户匹配结果不唯一，导入已停止');
      const customer = context.customerMatches[0]
        ? { id: context.customerMatches[0].id, name: clean(input.customerName), matchStatus: '已绑定客户' as const }
        : { id: '', name: clean(input.customerName), matchStatus: '售后临时客户' as const };
      const recoveryUser = uniqueByName(context.users, clean(input.recoveryUserName), '挽回人员');
      const assistUser = clean(input.assistUserName) ? uniqueByName(context.users, clean(input.assistUserName), '协助人员') : undefined;
      const platform = clean(input.sourcePlatform) ? context.recoveryPlatforms.find((item) => item.name === clean(input.sourcePlatform)) : undefined;
      const shop = clean(input.sourceShop) ? context.recoveryShops.find((item) => item.name === clean(input.sourceShop) && (!platform || item.platformId === platform.id)) : undefined;
      if (clean(input.sourcePlatform) && !platform) throw new Error('售后来源平台已停用');
      if (clean(input.sourceShop) && !shop) throw new Error('售后来源店铺已停用');
      const result = await deps.createImportedRecoveryOrder({
        idempotencyKey, actor: context.actor, metadata: importMetadata, row, customer,
        data: {
          customerName: customer.name, customerPhone: clean(input.customerPhone) || undefined,
          customerWechat: clean(input.customerWechat) || undefined, thirdPartyOrderNo: clean(input.thirdPartyOrderNo),
          sourcePlatform: platform?.name, sourcePlatformId: platform?.id, sourcePlatformName: platform?.name,
          sourceShopId: shop?.id, sourceShopName: shop?.name, originalProduct: clean(input.originalProduct),
          originalAmount: number(input.originalAmount), recoveryAmount: number(input.recoveryAmount), recoveryAt: clean(input.recoveryAt),
          officialPaymentChannel: clean(input.paymentChannel) as any || undefined,
          paymentOrderNo: clean(input.paymentOrderNo) || undefined, paymentAt: clean(input.paymentAt) || undefined,
          recoveryUserId: recoveryUser.id, recoveryUserName: recoveryUser.name,
          assistUserId: assistUser?.id, assistUserName: assistUser?.name,
          recoveryAttachments: attachments.recoveryEvidence,
          remark: clean(input.remark) || undefined, createdBy: context.actor.id, createdByName: context.actor.name,
        },
      });
      return { recordId: result.id };
    },
  };
}

export function createBusinessImportWorker(options: {
  store: BusinessImportJobStore;
  executor: BusinessImportRowExecutor;
  workerId: string;
  now?: () => Date;
  leaseMs?: number;
  pollIntervalMs?: number;
  onError?: (error: unknown) => void;
}) {
  const now = () => options.now?.() || new Date();
  const leaseMs = options.leaseMs ?? 60_000;
  const pollIntervalMs = options.pollIntervalMs ?? 2_000;
  let timer: ReturnType<typeof setInterval> | null = null;
  let active: Promise<number> | null = null;
  let stopping = false;
  const claimJob = (jobId?: string) => options.store.claim({ workerId: options.workerId, ...(jobId ? { jobId } : {}), now: now(), leaseMs });
  const processJob = async (lease: BusinessImportJobLease): Promise<boolean> => {
    const heartbeatIntervalMs = Math.max(1, Math.floor(leaseMs / 3));
    let leaseLost = false;
    let heartbeatRun: Promise<void> | null = null;
    const heartbeat = () => {
      if (heartbeatRun || leaseLost) return;
      heartbeatRun = options.store.heartbeat(lease, leaseMs, now()).then((active) => {
        if (!active) leaseLost = true;
      }).catch((error) => {
        leaseLost = true;
        options.onError?.(error);
      }).finally(() => { heartbeatRun = null; });
    };
    const heartbeatTimer = setInterval(heartbeat, heartbeatIntervalMs);
    const stopHeartbeat = async () => {
      clearInterval(heartbeatTimer);
      if (heartbeatRun) await heartbeatRun;
    };
    try {
      while (!stopping && !leaseLost) {
        const row = await options.store.nextRow(lease);
        if (!row) {
          await stopHeartbeat();
          return !stopping && !leaseLost ? options.store.finalize(lease) : false;
        }
        try {
          const result = await options.executor.execute(lease, row);
          if (leaseLost || !await options.store.markSucceeded(lease, row.rowNumber, result.recordId)) return false;
        } catch (error) {
          if (leaseLost || !await options.store.markFailed(lease, row.rowNumber, safeBusinessImportErrorMessage(error))) return false;
        }
      }
      return false;
    } finally {
      await stopHeartbeat();
      await options.executor.releaseJob?.(lease);
    }
  };
  const runOnce = (): Promise<number> => {
    if (active) return active;
    active = (async () => {
      const lease = await claimJob();
      if (!lease) return 0;
      await processJob(lease);
      return 1;
    })().finally(() => { active = null; });
    return active;
  };
  const runSafely = () => { void runOnce().catch((error) => options.onError?.(error)); };
  return {
    claimJob,
    processJob,
    runOnce,
    start() { if (timer) return; stopping = false; runSafely(); timer = setInterval(runSafely, pollIntervalMs); },
    async stop() { stopping = true; if (timer) clearInterval(timer); timer = null; if (active) await active.catch((error) => options.onError?.(error)); },
  };
}
