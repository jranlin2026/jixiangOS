import assert from 'node:assert/strict';
import { STORAGE_KEYS } from '../shared/utils/constants';

const storage = (() => {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: storage,
  configurable: true,
});

const previousBackendFlag = process.env.VITE_USE_BACKEND_API;
const previousFetch = globalThis.fetch;
process.env.VITE_USE_BACKEND_API = 'true';

storage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
storage.setItem(STORAGE_KEYS.ASSET_DEVICES, JSON.stringify([
  { id: 'device-a', deviceName: 'A', simType: '双卡', imei1: '111', imei1Masked: '***111' },
  { id: 'device-b', deviceName: 'B', simType: '双卡', imei1: '222', imei1Masked: '***222' },
]));
storage.setItem(STORAGE_KEYS.ASSET_PHONE_NUMBERS, JSON.stringify([
  {
    id: 'phone-1',
    phoneNumber: '13800000000',
    phoneNumberMasked: '138****0000',
    deviceId: 'device-a',
    slotType: '卡槽1',
    owner: '管理员',
    currentUser: '管理员',
    department: '运营管理部',
    monthlyFee: 0,
  },
]));
for (const key of [
  STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS,
  STORAGE_KEYS.ASSET_RISKS,
  STORAGE_KEYS.ASSET_OPERATION_LOGS,
  STORAGE_KEYS.ASSET_OFFBOARDING_TASKS,
  STORAGE_KEYS.ASSET_MATRIX_PUBLISH_TASKS,
]) {
  storage.setItem(key, '[]');
}

type WriteGate = {
  wait: Promise<void>;
  release: () => void;
  started: Promise<void>;
  signalStarted: () => void;
  completed: boolean;
};

function createWriteGate(): WriteGate {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  let signalStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    signalStarted = resolve;
  });
  return { wait, release, started, signalStarted, completed: false };
}

let activeStorageWrite: { key: string; gate: WriteGate } | null = null;

const okResponse = () => new Response(JSON.stringify({ code: 0, data: null, message: 'success' }), {
  status: 200,
  headers: { 'content-type': 'application/json' },
});

globalThis.fetch = (async (input) => {
  const url = String(input);
  if (activeStorageWrite && url.includes(`/storage/${encodeURIComponent(activeStorageWrite.key)}`)) {
    const gate = activeStorageWrite.gate;
    gate.signalStarted();
    await gate.wait;
    gate.completed = true;
  }
  return okResponse();
}) as typeof fetch;

async function assertWaitsForPersistence(key: string, run: () => Promise<unknown>, message: string): Promise<void> {
  const gate = createWriteGate();
  activeStorageWrite = { key, gate };
  let settled = false;
  const operation = run().finally(() => {
    settled = true;
  });
  await gate.started;
  await new Promise((resolve) => setTimeout(resolve, 20));
  let earlyAssertion: unknown;
  try {
    assert.equal(settled, false, message);
  } catch (error) {
    earlyAssertion = error;
  }
  gate.release();
  await operation;
  assert.equal(gate.completed, true);
  activeStorageWrite = null;
  if (earlyAssertion) throw earlyAssertion;
}

try {
  const { assetApi } = await import('./assetApi');
  await assertWaitsForPersistence(
    STORAGE_KEYS.ASSET_PHONE_NUMBERS,
    () => assetApi.createPhoneNumber({
      phoneNumber: '13900000001',
      deviceId: 'device-b',
      slotType: '卡槽2',
      owner: '管理员',
    }),
    '新增手机号不应在后台持久化完成前返回',
  );
  await assertWaitsForPersistence(
    STORAGE_KEYS.ASSET_PHONE_NUMBERS,
    () => assetApi.updatePhoneNumber('phone-1', { deviceId: 'device-b', slotType: '卡槽1' }),
    '手机号更新不应在后台持久化完成前返回',
  );
  storage.setItem(STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS, JSON.stringify([
    { id: 'account-1', phoneId: 'phone-1', accountName: '关联账号' },
  ]));
  storage.setItem(STORAGE_KEYS.ASSET_OFFBOARDING_TASKS, JSON.stringify([
    { id: 'task-1', assetType: '手机号资产', assetId: 'phone-1' },
  ]));
  await assertWaitsForPersistence(
    STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS,
    () => assetApi.deletePhoneNumber('phone-1'),
    '删除手机号不应在关联账号解绑持久化完成前返回',
  );
} finally {
  (activeStorageWrite as { gate: WriteGate } | null)?.gate.release();
  globalThis.fetch = previousFetch;
  if (previousBackendFlag === undefined) delete process.env.VITE_USE_BACKEND_API;
  else process.env.VITE_USE_BACKEND_API = previousBackendFlag;
}
