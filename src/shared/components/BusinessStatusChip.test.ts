import assert from 'node:assert/strict';
import { getBusinessStatusTone } from './BusinessStatusChip';

assert.equal(getBusinessStatusTone('待审核'), 'purple');
assert.equal(getBusinessStatusTone('退回修改'), 'blue');
assert.equal(getBusinessStatusTone('已通过'), 'green');
assert.equal(getBusinessStatusTone('已驳回'), 'red');
assert.equal(getBusinessStatusTone('已确认'), 'neutral');
assert.equal(getBusinessStatusTone('待分账'), 'amber');
assert.equal(getBusinessStatusTone('待确认'), 'blue');
assert.equal(getBusinessStatusTone('待发放'), 'blue');
assert.equal(getBusinessStatusTone('已发放'), 'green');
assert.equal(getBusinessStatusTone('已撤回'), 'gray');
