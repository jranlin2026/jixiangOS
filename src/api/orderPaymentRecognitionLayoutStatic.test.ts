import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const attachmentPickerSource = readFileSync(
  join(process.cwd(), 'src/shared/components/BusinessAttachmentPicker.tsx'),
  'utf8',
);
const orderFormSource = readFileSync(
  join(process.cwd(), 'src/pages/Orders/OrderForm.tsx'),
  'utf8',
);

assert.match(
  attachmentPickerSource,
  /'选择文件'[\s\S]*?headerAction/,
  'Attachment picker should render its optional header action after the choose-file button.',
);

const paymentPickerSource = orderFormSource.slice(
  orderFormSource.indexOf('title="付款截图"'),
  orderFormSource.indexOf('title="成交路径 / 聊天记录"'),
);

assert.match(
  paymentPickerSource,
  /headerAction=\{[\s\S]*?确认识别付款截图[\s\S]*?\}/,
  'Payment recognition should be supplied as the payment picker header action.',
);
