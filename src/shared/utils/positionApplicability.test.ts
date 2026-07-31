import assert from 'node:assert/strict';
import { isPositionApplicableToDepartment } from './positionApplicability';

const departments = [
  { id: 'sales', parentId: null },
  { id: 'sales-one', parentId: 'sales' },
  { id: 'sales-one-a', parentId: 'sales-one' },
  { id: 'service', parentId: null },
];

assert.equal(isPositionApplicableToDepartment(
  { departmentId: 'sales', departmentScope: 'DEPARTMENT_TREE' },
  'sales-one-a',
  departments,
), true, '本部门及下级部门应覆盖任意层级的后代部门');

assert.equal(isPositionApplicableToDepartment(
  { departmentId: 'sales', departmentScope: 'DEPARTMENT_ONLY' },
  'sales-one',
  departments,
), false, '仅本部门不能被直接子部门使用');

assert.equal(isPositionApplicableToDepartment(
  { departmentId: 'sales', departmentScope: 'DEPARTMENT_TREE' },
  'service',
  departments,
), false, '其他部门不能使用销售部门树岗位');

assert.equal(isPositionApplicableToDepartment(
  { departmentId: null, departmentScope: 'DEPARTMENT_ONLY' },
  'service',
  departments,
), true, '未归属部门的岗位应全公司适用');
