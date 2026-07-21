import assert from 'node:assert/strict';
import { synchronizeClientInstallation } from './systemInstallationCache';

const values = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    get length() { return values.size; },
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  },
  configurable: true,
});

values.set('aaos_customers', '[{"id":"legacy"}]');
values.set('theme', 'dark');
synchronizeClientInstallation('installation-a');
assert.equal(values.has('aaos_customers'), false, '首次绑定安装实例时必须清除旧业务缓存');
assert.equal(values.get('theme'), 'dark', '不得清除非极享OS浏览器设置');

values.set('aaos_customers', '[{"id":"current"}]');
synchronizeClientInstallation('installation-a');
assert.equal(values.has('aaos_customers'), true, '同一安装实例刷新不得误清当前缓存');

synchronizeClientInstallation('installation-b');
assert.equal(values.has('aaos_customers'), false, '切换数据库安装实例时必须清除旧业务缓存');

console.log('system installation cache tests passed');
