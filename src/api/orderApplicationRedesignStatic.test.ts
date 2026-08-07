import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(process.cwd(), 'src/pages/Orders/OrderForm.tsx'), 'utf8');

assert.match(source, /申请人/);
assert.match(source, /申请日期/);
assert.match(source, /title="订单与成交渠道"/);
assert.match(source, /title="付款与凭证"/);
assert.match(source, /position: 'sticky'/, '订单申请应使用底部吸附汇总操作栏');
assert.match(source, /产品合计/);
assert.match(source, /实付金额/);
assert.doesNotMatch(source, /保存草稿/, '本版订单申请不提供保存草稿');
assert.doesNotMatch(source, /minWidth: 820/, '产品区不应强制宽表格');
assert.doesNotMatch(source, /<BusinessFormSection step=\{5\}/, '备注应并入订单信息，不再单独占一段');
assert.match(
  source,
  /data-testid="order-product-name-stack"[\s\S]*?flexDirection: 'column'/,
  '产品选择器与主产品标识应纵向排列，避免窄屏时挤入产品等级列',
);

console.log('order application redesign static tests passed');
