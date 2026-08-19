import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./useProtectedFormClose.tsx', import.meta.url), 'utf8');

assert.match(source, /onChange: markDirty/, '表单字段应先完成自身 change 更新，再标记弹窗已修改');
assert.match(source, /onInput: markDirty/, '输入法 input 事件应在冒泡阶段标记已修改');
assert.doesNotMatch(source, /on(?:Change|Input|Paste|Drop)Capture/, '不得在捕获阶段更新弹窗状态，避免吞掉中文输入法的首字符');
