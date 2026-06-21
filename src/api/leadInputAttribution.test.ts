import assert from 'node:assert/strict';
import { applyCurrentLeadInputBy, getCurrentLeadInputUser } from '../shared/utils/leadInputAttribution';
import { STORAGE_KEYS } from '../shared/utils/constants';
import { AUTH_SESSION_STORAGE_KEY } from '../shared/utils/auth';

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

const now = '2026-06-22T10:00:00.000Z';

storage.clear();
storage.setItem(STORAGE_KEYS.USERS, JSON.stringify([
  {
    id: 'user-login',
    name: 'Logged In Sales',
    account: 'login_sales',
    email: '',
    phone: '',
    role: 'Sales',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'user-other',
    name: 'Other Sales',
    account: 'other_sales',
    email: '',
    phone: '',
    role: 'Sales',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
]));
storage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({
  userId: 'user-login',
  token: 'test-token',
  remember: true,
  createdAt: now,
}));

const currentUser = getCurrentLeadInputUser();
assert.equal(currentUser?.id, 'user-login');
assert.equal(currentUser?.name, 'Logged In Sales');

const leadPayload = applyCurrentLeadInputBy({ inputBy: 'User Picked Name', name: 'Lead A' }, 'inputBy');
assert.equal(leadPayload.inputBy, 'Logged In Sales');

const customerPayload = applyCurrentLeadInputBy({ leadInputBy: 'User Picked Name', name: 'Customer A' }, 'leadInputBy');
assert.equal(customerPayload.leadInputBy, 'Logged In Sales');

storage.removeItem(AUTH_SESSION_STORAGE_KEY);
const fallbackPayload = applyCurrentLeadInputBy({ inputBy: 'Existing Name', name: 'Lead B' }, 'inputBy');
assert.equal(fallbackPayload.inputBy, 'Existing Name');
