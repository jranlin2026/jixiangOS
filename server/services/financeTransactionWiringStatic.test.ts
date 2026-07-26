import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const server = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');
assert.match(server, /recordOrderPayments\(context\.transaction, context\.order, context\.reviewer, context\.approvedAt\)/, '订单审核事务必须写入实际付款流水');
assert.match(server, /recordFinanceTransaction:[\s\S]*recordCommissionPayout\(transaction, payout\)/, '提成发放事务必须写入发放单流水');
assert.match(server, /\/api\/finance-transactions/, '真实收支流水必须由后端接口提供');
console.log('finance transaction wiring static tests passed');
