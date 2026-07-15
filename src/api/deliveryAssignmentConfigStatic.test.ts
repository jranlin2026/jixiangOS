import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const settings = readFileSync(join(process.cwd(), 'src/pages/Settings/index.tsx'), 'utf8');
const sidebar = readFileSync(join(process.cwd(), 'src/layouts/Sidebar.tsx'), 'utf8');
const delivery = readFileSync(join(process.cwd(), 'src/pages/Delivery/index.tsx'), 'utf8');
const componentPath = join(process.cwd(), 'src/pages/Settings/DeliveryAssignmentConfig.tsx');

assert.match(settings, /DeliveryAssignmentConfig/);
assert.match(sidebar, /group=delivery/);
assert.match(sidebar, /SETTINGS_DELIVERY_ASSIGNMENT/);
const component = readFileSync(componentPath, 'utf8');
assert.match(component, /客户成功分配/);
assert.match(component, /下一位预计分配人员/);
assert.match(component, /暂停接单/);
assert.match(component, /moveParticipant/);

const saveAssign = delivery.match(/const saveAssign = async \(\) => \{[\s\S]*?\n  \};/)?.[0] || '';
assert.doesNotMatch(saveAssign, /refreshAfterMutation\(res\.data\?\.id\)/);
assert.match(saveAssign, /分配成功/);
