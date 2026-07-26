import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  assertSafeCloneDatabaseUrl,
  customerAlias,
  sanitizeBusinessValue,
  sanitizeCustomerValue,
} from './lib/cloneSanitizer';

assert.doesNotThrow(() => assertSafeCloneDatabaseUrl('mysql://clone:pass@127.0.0.1:3306/jixiang_os_prod_clone_test'));
assert.throws(() => assertSafeCloneDatabaseUrl('mysql://clone:pass@db.example.com:3306/jixiang_os_prod_clone_test'), /本机/);
assert.throws(() => assertSafeCloneDatabaseUrl('mysql://clone:pass@localhost:3306/jixiang_os'), /prod_clone_test/);

const alias = customerAlias('customer-1');
assert.equal(alias, customerAlias('customer-1'));
assert.notEqual(alias, customerAlias('customer-2'));
const customer = sanitizeCustomerValue({ id: 'customer-1', name: '真实姓名', company: '真实公司', phone: '13800138000', email: 'real@example.com', amount: 999 }, 'customer-1') as any;
assert.equal(customer.name, alias);
assert.equal(customer.amount, 999);
assert.doesNotMatch(JSON.stringify(customer), /真实姓名|真实公司|13800138000|real@example\.com/);
const order = sanitizeBusinessValue({ customerId: 'customer-1', customerName: '真实姓名', amount: 100, payments: [{ amount: 100 }] }, 'order-1', new Map([['customer-1', alias]])) as any;
assert.equal(order.customerName, alias);
assert.equal(order.payments[0].amount, 100);

const source = readFileSync(new URL('./sanitize-production-clone.ts', import.meta.url), 'utf8');
assert.match(source, /SANITIZE_PRODUCTION_CLONE/);
assert.match(source, /LOCAL_CLONE_ADMIN_PASSWORD/);
assert.match(source, /authSession\.deleteMany/);
assert.match(source, /AI_SESSIONS/);
assert.match(source, /apiProviderConfig|aiProviderConfig/);
assert.match(source, /enabled: false/);
assert.match(source, /isActive: false/);
console.log('production clone sanitizer safety tests passed');
