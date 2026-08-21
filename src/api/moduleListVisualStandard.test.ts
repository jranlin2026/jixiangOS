import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const moduleShell = readFileSync(join(root, 'src/shared/components/ModuleShell.tsx'), 'utf8');
const dataTableWorkspace = readFileSync(join(root, 'src/shared/components/DataTableWorkspace.tsx'), 'utf8');
const orders = readFileSync(join(root, 'src/pages/Orders/index.tsx'), 'utf8');
const leads = readFileSync(join(root, 'src/pages/Leads/index.tsx'), 'utf8');

assert.match(moduleShell, /data-module-list-surface="standard"/, '统一列表必须具备稳定的视觉标准标识。');
assert.match(moduleShell, /export const moduleListTablePaperSx/, '统一列表必须复用相同的表格容器样式。');
assert.match(moduleShell, /export const moduleListPaginationSx/, '统一列表必须复用相同的分页容器样式。');
assert.match(dataTableWorkspace, /data-table-workspace="true"/, '统一数据工作区必须具备稳定的视觉标准标识。');

for (const [name, source] of [['订单列表', orders], ['线索列表', leads]] as const) {
  assert.match(source, /<DataTableWorkspace/, `${name}必须使用统一数据工作区结构。`);
  assert.match(source, /moduleListTablePaperSx/, `${name}必须使用统一表格容器。`);
  assert.match(source, /moduleListPaginationSx/, `${name}必须使用统一分页容器。`);
}
