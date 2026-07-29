import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const employeePage = readFileSync(new URL('./EmployeeDepartmentManagement.tsx', import.meta.url), 'utf8');
const recycleBinPage = readFileSync(new URL('./AccountRecycleBin.tsx', import.meta.url), 'utf8');

assert.doesNotMatch(employeePage, /<TableCell>职务<\/TableCell>/, '员工列表字段必须统一显示为岗位');
assert.doesNotMatch(employeePage, /职位是员工资料中的文本字段/, '批量转部门说明不得继续把职位当作自由文本字段');
assert.match(employeePage, /label="岗位"/, '员工编辑必须通过正式岗位选择器维护岗位');
assert.doesNotMatch(recycleBinPage, /<TableCell>职位<\/TableCell>/, '离职账号列表字段必须统一显示为岗位');
assert.match(recycleBinPage, /settingsApi\.fetchPositions\(\)/, '离职账号列表必须加载正式岗位目录');
assert.match(recycleBinPage, /position\.id === user\.positionId/, '离职账号列表必须优先按正式岗位ID显示岗位名');
