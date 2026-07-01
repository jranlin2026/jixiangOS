import assert from 'node:assert/strict';
import { customerApi } from './customerApi';
import { dashboardApi } from './dashboardApi';
import { leadApi } from './leadApi';
import { orderApi } from './orderApi';
import { STORAGE_KEYS } from '../shared/utils/constants';
import { AUTH_SESSION_STORAGE_KEY } from '../shared/utils/auth';
import { PERMISSION_KEYS } from '../shared/utils/permissions';

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

const now = new Date().toISOString();

const users = [
  { id: 'user-sales-a', name: 'Sales A', account: 'sales_a', email: 'a@test.local', phone: '', role: 'Sales Consultant', roleId: 'role-sales', departmentId: 'dept-sales', isActive: true, createdAt: now, updatedAt: now },
  { id: 'user-sales-b', name: 'Sales B', account: 'sales_b', email: 'b@test.local', phone: '', role: 'Sales Consultant', roleId: 'role-sales', departmentId: 'dept-sales', isActive: true, createdAt: now, updatedAt: now },
  { id: 'user-sales-other', name: 'Other Sales', account: 'sales_other', email: 'other@test.local', phone: '', role: 'Sales Consultant', roleId: 'role-sales', departmentId: 'dept-other', isActive: true, createdAt: now, updatedAt: now },
  { id: 'user-manager', name: 'Sales Manager', account: 'manager', email: 'manager@test.local', phone: '', role: 'Sales Manager', roleId: 'role-manager', departmentId: 'dept-sales', isActive: true, createdAt: now, updatedAt: now },
  { id: 'user-finance', name: 'Finance A', account: 'finance', email: 'finance@test.local', phone: '', role: 'Finance Specialist', roleId: 'role-finance', departmentId: 'dept-finance', isActive: true, createdAt: now, updatedAt: now },
  { id: 'user-aa', name: 'AA User', account: 'aa', email: 'aa@test.local', phone: '', role: 'AA', roleId: 'role-aa', departmentId: 'dept-finance', isActive: true, createdAt: now, updatedAt: now },
  { id: 'user-admin', name: 'Admin', account: 'admin', email: 'admin@test.local', phone: '', role: 'Super Admin', roleId: 'role-admin', departmentId: 'dept-admin', isActive: true, createdAt: now, updatedAt: now },
  { id: 'user-system-admin', name: 'System Admin Name', account: 'system_admin', email: 'system-admin@test.local', phone: '', role: '系统管理员', departmentId: 'dept-admin', isActive: true, createdAt: now, updatedAt: now },
];

const roles = [
  { id: 'role-sales', name: 'Sales Consultant', code: 'sales_consultant', permissions: [{ module: PERMISSION_KEYS.LEADS, actions: ['read'] }], dataScopes: { leads: 'self', customers: 'self', orders: 'self', orderApplications: 'self' }, memberCount: 3, isActive: true, createdAt: now, updatedAt: now },
  { id: 'role-manager', name: 'Sales Manager', code: 'sales_manager', permissions: [{ module: PERMISSION_KEYS.LEADS, actions: ['read'] }], dataScopes: { leads: 'department', customers: 'department', orders: 'department', orderApplications: 'department' }, memberCount: 1, isActive: true, createdAt: now, updatedAt: now },
  { id: 'role-finance', name: 'Finance Specialist', code: 'finance_specialist', permissions: [{ module: PERMISSION_KEYS.ORDER_MANAGE, actions: ['read'] }], dataScopes: { leads: 'self', customers: 'self', orders: 'self', orderApplications: 'self' }, memberCount: 1, isActive: true, createdAt: now, updatedAt: now },
  { id: 'role-aa', name: 'AA', code: 'role-aa', permissions: [{ module: PERMISSION_KEYS.ORDER_MANAGE, actions: ['read'] }], dataScopes: { leads: 'self', customers: 'self', orders: 'all', orderApplications: 'all' }, memberCount: 1, isActive: true, createdAt: now, updatedAt: now },
  { id: 'role-admin', name: 'Super Admin', code: 'super_admin', permissions: [{ module: '\u5168\u90e8', actions: ['admin'] }], memberCount: 1, isActive: true, createdAt: now, updatedAt: now },
];

const departments = [
  { id: 'dept-sales', name: 'Sales', code: 'SALES', managerId: 'user-manager', memberCount: 3, isActive: true, createdAt: now, updatedAt: now },
  { id: 'dept-other', name: 'Other', code: 'OTHER', memberCount: 1, isActive: true, createdAt: now, updatedAt: now },
  { id: 'dept-finance', name: 'Finance', code: 'FINANCE', memberCount: 1, isActive: true, createdAt: now, updatedAt: now },
  { id: 'dept-admin', name: 'Admin', code: 'ADMIN', memberCount: 1, isActive: true, createdAt: now, updatedAt: now },
];

function resetData(userId: string) {
  storage.clear();
  storage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
  storage.setItem(STORAGE_KEYS.ORGANIZATION_SCHEMA_VERSION, '3');
  storage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
  storage.setItem(STORAGE_KEYS.ROLES, JSON.stringify(roles));
  storage.setItem(STORAGE_KEYS.DEPARTMENTS, JSON.stringify(departments));
  storage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({
    userId,
    token: `test-${userId}`,
    remember: true,
    createdAt: now,
  }));
  storage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify([
    { id: 'cust-a', name: 'Customer A', company: 'A Co', phone: '13900000001', customerLevel: 'L1', lifecycleStatusCode: 'following', owner: 'Sales A', totalSpent: 0, orderCount: 0, growthPath: [], growthRecords: [], createdAt: now, updatedAt: now },
    { id: 'cust-b', name: 'Customer B', company: 'B Co', phone: '13900000002', customerLevel: 'L1', lifecycleStatusCode: 'following', owner: 'Sales B', totalSpent: 0, orderCount: 0, growthPath: [], growthRecords: [], createdAt: now, updatedAt: now },
    { id: 'cust-other', name: 'Customer Other', company: 'Other Co', phone: '13900000003', customerLevel: 'L1', lifecycleStatusCode: 'following', owner: 'Other Sales', totalSpent: 0, orderCount: 0, growthPath: [], growthRecords: [], createdAt: now, updatedAt: now },
    { id: 'cust-public', name: 'Public Customer', company: 'Public Co', phone: '13900000004', customerLevel: 'L1', lifecycleStatusCode: 'public_pool', owner: 'Other Sales', totalSpent: 0, orderCount: 0, growthPath: [], growthRecords: [], createdAt: now, updatedAt: now },
  ]));
  storage.setItem(STORAGE_KEYS.LEADS, JSON.stringify([
    { id: 'lead-input-a', name: 'Lead Input A', company: 'Lead A Co', phone: '13800000001', source: 'Website', status: 'new', lifecycleStatusCode: 'pending_followup', inputBy: 'Sales A', owner: 'Other Sales', createdAt: now, updatedAt: now, followUpRecords: [] },
    { id: 'lead-assigned-a', name: 'Lead Assigned A', company: 'Lead Assigned Co', phone: '13800000002', source: 'Website', status: 'new', lifecycleStatusCode: 'pending_followup', inputBy: 'Other Sales', assignedTo: 'Sales A', owner: 'Sales A', createdAt: now, updatedAt: now, followUpRecords: [] },
    { id: 'lead-b', name: 'Lead B', company: 'Lead B Co', phone: '13800000003', source: 'Website', status: 'new', lifecycleStatusCode: 'pending_followup', inputBy: 'Sales B', owner: 'Sales B', createdAt: now, updatedAt: now, followUpRecords: [] },
    { id: 'lead-other', name: 'Lead Other', company: 'Lead Other Co', phone: '13800000004', source: 'Website', status: 'new', lifecycleStatusCode: 'pending_followup', inputBy: 'Other Sales', owner: 'Other Sales', createdAt: now, updatedAt: now, followUpRecords: [] },
  ]));
  storage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify([
    { id: 'order-a', orderNo: 'ORD-A', customerId: 'cust-a', customerName: 'A Co', productLevel: '899', orderType: 'New', amount: 100, actualAmount: 100, paymentMethod: 'Cash', status: 'paid', refundStatus: 'None', owner: 'Sales A', salesId: 'user-sales-a', salesName: 'Sales A', payments: [], createdAt: now, updatedAt: now },
    { id: 'order-b', orderNo: 'ORD-B', customerId: 'cust-b', customerName: 'B Co', productLevel: '899', orderType: 'New', amount: 200, actualAmount: 200, paymentMethod: 'Cash', status: 'paid', refundStatus: 'None', owner: 'Sales B', salesId: 'user-sales-b', salesName: 'Sales B', payments: [], createdAt: now, updatedAt: now },
    { id: 'order-other', orderNo: 'ORD-OTHER', customerId: 'cust-other', customerName: 'Other Co', productLevel: '899', orderType: 'New', amount: 300, actualAmount: 300, paymentMethod: 'Cash', status: 'paid', refundStatus: 'None', owner: 'Other Sales', salesId: 'user-sales-other', salesName: 'Other Sales', payments: [], createdAt: now, updatedAt: now },
  ]));
}

async function idsForCurrentUser() {
  const customers = await customerApi.fetchCustomers({ pageSize: 20 });
  const publicCustomers = await customerApi.fetchCustomers({ pageSize: 20, lifecycleStatusCode: 'public_pool' });
  const leads = await leadApi.fetchLeads({ pageSize: 20 });
  const orders = await orderApi.fetchOrders({ pageSize: 20 });
  const stats = await orderApi.fetchOrderStats();
  const workbench = await dashboardApi.fetchHomeWorkbench();
  return {
    customers: customers.data.items.map((item) => item.id),
    publicCustomers: publicCustomers.data.items.map((item) => item.id),
    leads: leads.data.items.map((item) => item.id),
    orders: orders.data.items.map((item) => item.id),
    stats: stats.data,
    quickActions: workbench.data.quickActions.map((item) => item.id),
  };
}

resetData('user-sales-a');
storage.removeItem(AUTH_SESSION_STORAGE_KEY);
const anonymousScope = await idsForCurrentUser();
assert.deepEqual(anonymousScope.customers, []);
assert.deepEqual(anonymousScope.publicCustomers, []);
assert.deepEqual(anonymousScope.leads, []);
assert.deepEqual(anonymousScope.orders, []);
assert.deepEqual(anonymousScope.quickActions, []);
assert.equal(anonymousScope.stats.monthCount, 0);
assert.equal(anonymousScope.stats.monthAmount, 0);

resetData('missing-user');
const missingUserScope = await idsForCurrentUser();
assert.deepEqual(missingUserScope.customers, []);
assert.deepEqual(missingUserScope.leads, []);
assert.deepEqual(missingUserScope.orders, []);
assert.deepEqual(missingUserScope.quickActions, []);
assert.equal(missingUserScope.stats.monthCount, 0);
assert.equal(missingUserScope.stats.monthAmount, 0);

resetData('user-sales-a');
const salesScope = await idsForCurrentUser();
assert.deepEqual(salesScope.customers, ['cust-a']);
assert.deepEqual(salesScope.publicCustomers, ['cust-public']);
assert.deepEqual(salesScope.leads, ['lead-input-a', 'lead-assigned-a']);
assert.deepEqual(salesScope.orders, ['order-a']);
assert.equal(salesScope.stats.monthCount, 1);
assert.equal(salesScope.stats.monthAmount, 100);
assert.equal((await customerApi.fetchCustomerById('cust-b')).data, null);
assert.equal((await leadApi.fetchLeadById('lead-other')).data, null);
assert.equal((await orderApi.fetchOrderById('order-other')).data, null);

resetData('user-manager');
const managerScope = await idsForCurrentUser();
assert.deepEqual(managerScope.customers, ['cust-a', 'cust-b']);
assert.deepEqual(managerScope.publicCustomers, ['cust-public']);
assert.deepEqual(managerScope.leads, ['lead-input-a', 'lead-assigned-a', 'lead-b']);
assert.deepEqual(managerScope.orders, ['order-a', 'order-b']);
assert.equal(managerScope.stats.monthCount, 2);
assert.equal(managerScope.stats.monthAmount, 300);
assert.equal((await customerApi.fetchCustomerById('cust-other')).data, null);

resetData('user-finance');
const financeScope = await idsForCurrentUser();
assert.deepEqual(financeScope.customers, []);
assert.deepEqual(financeScope.leads, []);
assert.deepEqual(financeScope.orders, []);
assert.equal(financeScope.stats.monthCount, 0);
assert.equal(financeScope.stats.monthAmount, 0);

resetData('user-aa');
const aaScope = await idsForCurrentUser();
assert.deepEqual(aaScope.customers, []);
assert.deepEqual(aaScope.leads, []);
assert.deepEqual(aaScope.orders, ['order-a', 'order-b', 'order-other']);
assert.equal(aaScope.stats.monthCount, 3);
assert.equal(aaScope.stats.monthAmount, 600);

resetData('user-admin');
const adminScope = await idsForCurrentUser();
assert.deepEqual(adminScope.customers, ['cust-a', 'cust-b', 'cust-other']);
assert.deepEqual(adminScope.publicCustomers, ['cust-public']);
assert.deepEqual(adminScope.leads, ['lead-input-a', 'lead-assigned-a', 'lead-b', 'lead-other']);
assert.deepEqual(adminScope.orders, ['order-a', 'order-b', 'order-other']);
assert.equal(adminScope.stats.monthCount, 3);
assert.equal(adminScope.stats.monthAmount, 600);

resetData('user-system-admin');
const systemAdminScope = await idsForCurrentUser();
assert.deepEqual(systemAdminScope.customers, ['cust-a', 'cust-b', 'cust-other']);
assert.deepEqual(systemAdminScope.publicCustomers, ['cust-public']);
assert.deepEqual(systemAdminScope.leads, ['lead-input-a', 'lead-assigned-a', 'lead-b', 'lead-other']);
assert.deepEqual(systemAdminScope.orders, ['order-a', 'order-b', 'order-other']);
