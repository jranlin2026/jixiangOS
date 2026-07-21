import assert from 'node:assert/strict';
import { DEFAULT_LIFECYCLE_STATUS_CONFIGS, STORAGE_KEYS } from '../../src/shared/utils/constants';
import { ensureSystemLifecycleDefaults } from './systemConfigMigrationService';

function createStore(initialValue: unknown) {
  let value = initialValue;
  let writes = 0;
  return {
    store: {
      appStorage: {
        findUnique: async ({ where }: any) => (
          where.key === STORAGE_KEYS.LIFECYCLE_STATUS_CONFIGS && value !== undefined
            ? { key: where.key, value }
            : null
        ),
        upsert: async ({ create, update }: any) => {
          value = value === undefined ? create.value : update.value;
          writes += 1;
        },
      },
    } as any,
    value: () => value,
    writes: () => writes,
  };
}

for (const initialValue of [undefined, []]) {
  const harness = createStore(initialValue);
  assert.equal(await ensureSystemLifecycleDefaults(harness.store), true);
  assert.deepEqual(harness.value(), DEFAULT_LIFECYCLE_STATUS_CONFIGS);
  assert.equal(harness.writes(), 1);
}

const customized = [{ ...DEFAULT_LIFECYCLE_STATUS_CONFIGS[0], name: '待联系' }];
const preserved = createStore(customized);
assert.equal(await ensureSystemLifecycleDefaults(preserved.store), false);
assert.deepEqual(preserved.value(), customized);
assert.equal(preserved.writes(), 0);

console.log('system config migration service tests passed');
