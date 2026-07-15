import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

const schema = read('prisma/schema.prisma');
const server = read('server/index.ts');
const detail = read('src/pages/Customers/CustomerDetail.tsx');

assert.match(schema, /model CustomerTodo\s*\{/);
assert.match(server, /app\.get\('\/api\/customers\/:id\/todos'/);
assert.match(server, /app\.post\('\/api\/customers\/:id\/todos'/);
assert.match(server, /app\.post\('\/api\/customers\/:id\/todos\/:todoId\/complete'/);
assert.match(detail, /<Tab label="待办"/);
assert.match(detail, /<CustomerTodoPanel/);

console.log('customer todo feature static tests passed');
