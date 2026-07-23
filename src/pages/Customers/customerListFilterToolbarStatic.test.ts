import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const customerPageSource = readFileSync(join(process.cwd(), 'src/pages/Customers/index.tsx'), 'utf8');
const serverSource = readFileSync(join(process.cwd(), 'server/index.ts'), 'utf8');
const listServiceSource = readFileSync(join(process.cwd(), 'server/services/customerListService.ts'), 'utf8');
const toolbarSource = customerPageSource.slice(
  customerPageSource.indexOf('<ModuleToolbar>'),
  customerPageSource.indexOf('</ModuleToolbar>'),
);

assert.match(toolbarSource, /<CustomerTagFilter[\s\S]*<CustomerLeadSourceFilter/);
assert.doesNotMatch(toolbarSource, /\u66f4\u591a\u7b5b\u9009|\u8ddf\u8fdb\u72b6\u6001|\u8d44\u6e90\u5f52\u5c5e|label="\u884c\u4e1a"|label="\u57ce\u5e02"/);
assert.match(serverSource, /sourceName: queryParam\(req\.query\.sourceName\)/);
assert.match(listServiceSource, /buildTextEqualCondition\('\$\.leadSource', filters\.leadSource\)/);
assert.match(listServiceSource, /buildTextEqualCondition\('\$\.sourceName', filters\.sourceName\)/);
