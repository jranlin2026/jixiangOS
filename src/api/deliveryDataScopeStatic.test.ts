import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const roleType = readFileSync(join(root, 'src/types/role.ts'), 'utf8');
const rolePermission = readFileSync(join(root, 'src/pages/Settings/RolePermission.tsx'), 'utf8');
const organization = readFileSync(join(root, 'src/shared/utils/organizationConfig.ts'), 'utf8');
const deliveryQuery = readFileSync(join(root, 'server/services/deliveryQueryService.ts'), 'utf8');
const deliveryCommand = readFileSync(join(root, 'server/services/deliveryCommandService.ts'), 'utf8');

assert.match(roleType, /\| 'deliveries'/, '角色数据权限域必须包含独立的交付数据');
assert.match(rolePermission, /domain: 'deliveries', label: '交付数据'/, '角色配置页必须显示交付数据范围');
assert.match(organization, /'deliveries'/, '组织权限标准化必须保留交付数据范围');
assert.match(deliveryQuery, /departments as any,\s*'deliveries'/, '交付查询必须使用交付数据范围');
assert.match(deliveryCommand, /departments, 'deliveries'\)/, '交付写操作必须使用交付数据范围');
