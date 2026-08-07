export type NotificationDeliveryResult = {
  status: 'SENT' | 'FAILED' | 'SKIPPED';
  error?: string;
  retryable?: boolean;
};

export type NotificationChannelAdapter = {
  send(context: any): Promise<NotificationDeliveryResult>;
};

export type NotificationWorkerStore = {
  claimSchedule(input: { workerId: string; now: Date; leaseMs: number }): Promise<any | null>;
  publishSchedule(schedule: any, input: { workerId: string; now: Date }): Promise<void>;
  retrySchedule(schedule: any, input: { workerId: string; now: Date; error: unknown }): Promise<void>;
  claimDelivery(input: { workerId: string; now: Date; leaseMs: number }): Promise<any | null>;
  loadDeliveryContext(delivery: any): Promise<any | null>;
  settleDelivery(delivery: any, result: NotificationDeliveryResult, input: { workerId: string; now: Date }): Promise<void>;
};

type NotificationWorkerOptions = {
  store: NotificationWorkerStore;
  adapters: Partial<Record<string, NotificationChannelAdapter>>;
  workerId: string;
  now?: () => Date;
  pollIntervalMs?: number;
  leaseMs?: number;
  batchSize?: number;
  onError?: (error: unknown) => void;
};

function safeError(error: unknown): string {
  return String((error as Error)?.message || error || '通知投递失败').slice(0, 500);
}

export function createNotificationWorker(options: NotificationWorkerOptions) {
  const now = () => options.now?.() || new Date();
  const leaseMs = Math.max(5_000, options.leaseMs || 60_000);
  const pollIntervalMs = Math.max(500, options.pollIntervalMs || 2_000);
  const batchSize = Math.max(1, Math.min(100, options.batchSize || 25));
  let timer: ReturnType<typeof setInterval> | null = null;
  let running: Promise<unknown> | null = null;

  const runOnce = async () => {
    let schedules = 0;
    let deliveries = 0;
    for (let index = 0; index < batchSize; index += 1) {
      const schedule = await options.store.claimSchedule({ workerId: options.workerId, now: now(), leaseMs });
      if (!schedule) break;
      try {
        await options.store.publishSchedule(schedule, { workerId: options.workerId, now: now() });
        schedules += 1;
      } catch (error) {
        await options.store.retrySchedule(schedule, { workerId: options.workerId, now: now(), error });
        options.onError?.(error);
      }
    }

    for (let index = 0; index < batchSize; index += 1) {
      const delivery = await options.store.claimDelivery({ workerId: options.workerId, now: now(), leaseMs });
      if (!delivery) break;
      const context = await options.store.loadDeliveryContext(delivery);
      const adapter = options.adapters[String(delivery.channel)];
      let result: NotificationDeliveryResult;
      if (!context) {
        result = { status: 'SKIPPED', error: '通知或接收人已不存在' };
      } else if (!adapter) {
        result = { status: 'SKIPPED', error: `未配置${String(delivery.channel)}投递通道` };
      } else {
        try {
          result = await adapter.send(context);
        } catch (error) {
          result = { status: 'FAILED', error: safeError(error), retryable: true };
          options.onError?.(error);
        }
      }
      await options.store.settleDelivery(delivery, result, { workerId: options.workerId, now: now() });
      deliveries += 1;
    }
    return { schedules, deliveries };
  };

  const tick = () => {
    if (running) return;
    running = runOnce()
      .catch((error) => options.onError?.(error))
      .finally(() => { running = null; });
  };

  return {
    runOnce,
    start() {
      if (timer) return;
      tick();
      timer = setInterval(tick, pollIntervalMs);
      timer.unref?.();
    },
    async stop() {
      if (timer) clearInterval(timer);
      timer = null;
      await running;
    },
  };
}
