import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(process.cwd(), 'server', 'index.ts'), 'utf8');
const runtimeStorageRouteSource = readFileSync(
  join(process.cwd(), 'server', 'routes', 'runtimeStorageRoutes.ts'),
  'utf8',
);

for (const [method, route] of [
  ['get', '/api/settings/users'],
  ['get', '/api/settings/assignable-users'],
  ['get', '/api/settings/assignable-directory'],
  ['get', '/api/settings/delivery-assignment'],
  ['put', '/api/settings/delivery-assignment'],
  ['post', '/api/settings/users/leave-customer-count'],
  ['post', '/api/settings/users'],
  ['put', '/api/settings/users/:id'],
  ['post', '/api/settings/users/:id/leave'],
  ['post', '/api/settings/users/:id/restore'],
  ['delete', '/api/settings/users/:id'],
  ['post', '/api/settings/users/:id/reset-password'],
  ['get', '/api/settings/roles'],
  ['post', '/api/settings/roles'],
  ['put', '/api/settings/roles/:id'],
  ['delete', '/api/settings/roles/:id'],
  ['get', '/api/settings/departments'],
  ['post', '/api/settings/departments'],
  ['put', '/api/settings/departments/:id'],
  ['delete', '/api/settings/departments/:id'],
  ['get', '/api/settings/positions'],
  ['get', '/api/ai/config'],
  ['put', '/api/ai/config'],
  ['post', '/api/ai/config/test'],
  ['post', '/api/order-applications'],
  ['get', '/api/order-applications'],
  ['get', '/api/orders/owner-candidates'],
  ['get', '/api/order-applications/:id'],
  ['post', '/api/order-applications/:id/resubmit'],
  ['post', '/api/order-applications/:id/return'],
  ['post', '/api/order-applications/:id/reject'],
  ['post', '/api/order-applications/:id/approve'],
  ['put', '/api/orders/:id'],
  ['get', '/api/orders'],
  ['get', '/api/orders/stats'],
  ['get', '/api/orders/:id'],
  ['delete', '/api/orders/:id'],
  ['get', '/api/deliveries'],
  ['get', '/api/deliveries/stats'],
  ['get', '/api/deliveries/creatable-orders'],
  ['get', '/api/deliveries/:id'],
  ['post', '/api/deliveries/from-order'],
  ['patch', '/api/deliveries/:id/card'],
  ['post', '/api/deliveries/:id/advance'],
  ['post', '/api/deliveries/:id/revert'],
  ['patch', '/api/deliveries/:id/tasks/:taskId'],
  ['post', '/api/deliveries/:id/tasks/:taskId/attachments'],
  ['post', '/api/deliveries/:id/exceptions'],
  ['post', '/api/deliveries/:id/exceptions/:exceptionId/resolve'],
  ['post', '/api/deliveries/:id/confirm'],
  ['delete', '/api/deliveries/:id'],
  ['post', '/api/recovery-orders'],
  ['post', '/api/customers/:id/claim'],
  ['post', '/api/customers/:id/assign'],
  ['put', '/api/customers/:id'],
  ['delete', '/api/customers/:id'],
  ['post', '/api/leads'],
  ['post', '/api/leads/:id/convert'],
  ['put', '/api/leads/:id'],
  ['delete', '/api/leads/:id'],
  ['post', '/api/leads/:id/follow-ups'],
  ['post', '/api/leads/:id/assign'],
  ['delete', '/api/storage'],
] as const) {
  const declaration = `app.${method}('${route}',`;
  assert.equal(source.split(declaration).length - 1, 1, `${method.toUpperCase()} ${route} 必须且只能声明一次`);
}

assert.match(source, /const requireOrganizationReadAccess = createRequireAuth\(authService, PERMISSION_KEYS\.SETTINGS_EMPLOYEES_DEPARTMENTS\);/);
assert.match(source, /const requireOrganizationWriteAccess = createRequireAuth\(authService, PERMISSION_KEYS\.SETTINGS_EMPLOYEES_DEPARTMENTS, 'write'\);/);
assert.match(source, /const requireOrganizationDeleteAccess = createRequireAuth\(authService, PERMISSION_KEYS\.SETTINGS_EMPLOYEES_DEPARTMENTS, 'delete'\);/);
assert.match(source, /const requireRoleReadAccess = createRequireAuth\(authService, PERMISSION_KEYS\.SETTINGS_ROLES\);/);
assert.match(source, /const requireRoleWriteAccess = createRequireAuth\(authService, PERMISSION_KEYS\.SETTINGS_ROLES, 'write'\);/);
assert.match(source, /const requireRoleDeleteAccess = createRequireAuth\(authService, PERMISSION_KEYS\.SETTINGS_ROLES, 'delete'\);/);
assert.match(source, /const requireAiConfigReadAccess = createRequireAuth\(authService, PERMISSION_KEYS\.SETTINGS_AI_CONFIG\);/);
assert.match(source, /const requireAiConfigWriteAccess = createRequireAuth\(authService, PERMISSION_KEYS\.SETTINGS_AI_CONFIG, 'write'\);/);
assert.match(source, /const requireDataMaintenanceDeleteAccess = createRequireAuth\(authService, PERMISSION_KEYS\.SETTINGS_DATA_MAINTENANCE, 'delete'\);/);
assert.match(source, /const requireDeliveryAssignmentReadAccess = createRequireAuth\(authService, PERMISSION_KEYS\.SETTINGS_DELIVERY_ASSIGNMENT\);/);
assert.match(source, /const requireDeliveryAssignmentWriteAccess = createRequireAuth\(authService, PERMISSION_KEYS\.SETTINGS_DELIVERY_ASSIGNMENT, 'write'\);/);
assert.match(source, /const requireOrderCreateWriteAccess = createRequireAuth\(authService, PERMISSION_KEYS\.ORDER_CREATE, 'write'\);/);
assert.match(source, /const requireOrderReadAccess = createRequireAuth\(authService, PERMISSION_KEYS\.ORDER_MANAGE\);/);
assert.match(source, /const requireOrderApplicationReadAccess = createRequireAuth\(authService, PERMISSION_KEYS\.ORDER_REVIEW_LIST\);/);
assert.match(source, /const requireOrderEditWriteAccess = createRequireAuth\(authService, PERMISSION_KEYS\.ORDER_EDIT, 'write'\);/);
assert.match(source, /const requireOrderDeleteAccess = createRequireAuth\(authService, PERMISSION_KEYS\.ORDER_DELETE, 'delete'\);/);
assert.match(source, /const requireOrderReviewWriteAccess = createRequireAuth\(authService, PERMISSION_KEYS\.ORDER_REVIEW, 'write'\);/);
assert.match(source, /const requireDeliveryReadAccess = createRequireAuth\(authService, PERMISSION_KEYS\.DELIVERY_CENTER\);/);
assert.match(source, /const requireDeliveryWriteAccess = createRequireAnyPermission\(authService, \[PERMISSION_KEYS\.DELIVERY_MOVE_CARD, PERMISSION_KEYS\.DELIVERY_STAGE_CONFIG\], 'write'\);/);
assert.match(source, /const requireRecoveryCreateAccess = createRequireAuth\(authService, PERMISSION_KEYS\.AFTER_SALES_RECOVERY_CREATE, 'write'\);/);
assert.match(
  source,
  /createOrderApplicationService\(prisma,\s*\{\s*applyDownstreamEffects: createOrderApprovalDownstreamEffects\(deliveryAssignmentService\)/,
  '订单审核服务必须注入客户、提成和交付的同事务副作用',
);

assert.match(source, /app\.get\('\/api\/settings\/users', requireOrganizationReadAccess,/);
assert.match(
  source,
  /app\.get\('\/api\/customers\/manageable-users', requireCustomerManageableUsersAccess, createCustomerManageableUsersHandler\(customerManageableUsersService\)\);/,
  '服务端必须实际挂载客户专用可管理人员目录',
);
assert.match(
  source,
  /const requireAssignableUsersAccess = createRequireAnyPermission\(authService, assignableUsersPermissions\);/,
  '候选人接口必须通过 requireAny 校验用途权限',
);
assert.match(source, /app\.get\('\/api\/settings\/assignable-directory', requireAssignableUsersAccess,/);
assert.match(
  source,
  /app\.get\('\/api\/settings\/assignable-users', requireAssignableUsersAccess, async \(_req: express\.Request, res: express\.Response\) => \{\s*res\.json\(await settingsService\.listAssignableUsers\(\)\);\s*\}\);/,
  '共享 assignable-users 必须保持跨模块候选人语义，不接受 customer scope 请求上下文',
);
const assignableUsersPermissionSource = source.slice(
  source.indexOf('const assignableUsersPermissions = ['),
  source.indexOf('const runtimeStorageKeys = ['),
);
for (const permissionKey of [
  'SETTINGS_DELIVERY_ASSIGNMENT',
  'LEADS_FLOW_CONFIG',
  'CUSTOMER_SET_TODOS',
  'CUSTOMER_TRANSFER',
  'AFTER_SALES_RECOVERY_CREATE',
] as const) {
  assert.match(
    assignableUsersPermissionSource,
    new RegExp(`PERMISSION_KEYS\\.${permissionKey}`),
    `共享候选目录必须保留 ${permissionKey} 模块用途`,
  );
}
for (const customerOnlyPermission of [
  'CUSTOMER_EDIT_PROFILE',
  'CUSTOMER_SET_TAGS',
  'CUSTOMER_SET_PROGRESS',
  'CUSTOMER_EDIT_ATTRIBUTION',
  'CUSTOMER_RELEASE_TO_POOL',
  'CUSTOMER_DELETE',
] as const) {
  assert.doesNotMatch(
    assignableUsersPermissionSource,
    new RegExp(`PERMISSION_KEYS\\.${customerOnlyPermission}`),
    `客户专用叶子 ${customerOnlyPermission} 不得扩张共享候选目录的访问面`,
  );
}
assert.match(source, /app\.get\('\/api\/settings\/delivery-assignment', requireDeliveryAssignmentReadAccess,/);
assert.match(source, /app\.put\('\/api\/settings\/delivery-assignment', requireDeliveryAssignmentWriteAccess,/);
assert.match(source, /app\.post\('\/api\/settings\/users\/leave-customer-count', requireOrganizationReadAccess,/);
assert.match(source, /app\.post\('\/api\/settings\/users', requireOrganizationWriteAccess,/);
assert.match(source, /app\.put\('\/api\/settings\/users\/:id', requireOrganizationWriteAccess,/);
assert.match(source, /app\.post\('\/api\/settings\/users\/:id\/leave', requireOrganizationWriteAccess,/);
assert.match(source, /app\.post\('\/api\/settings\/users\/:id\/restore', requireOrganizationWriteAccess,/);
assert.match(source, /app\.delete\('\/api\/settings\/users\/:id', requireOrganizationDeleteAccess,/);
assert.match(source, /app\.post\('\/api\/settings\/users\/:id\/reset-password', requireOrganizationWriteAccess,/);

assert.match(source, /app\.get\('\/api\/settings\/roles', requireRoleReadAccess,/);
assert.match(source, /app\.post\('\/api\/settings\/roles', requireRoleWriteAccess,/);
assert.match(source, /app\.put\('\/api\/settings\/roles\/:id', requireRoleWriteAccess,/);
assert.match(source, /app\.delete\('\/api\/settings\/roles\/:id', requireRoleDeleteAccess,/);

assert.match(source, /app\.get\('\/api\/settings\/departments', requireOrganizationReadAccess,/);
assert.match(source, /app\.post\('\/api\/settings\/departments', requireOrganizationWriteAccess,/);
assert.match(source, /app\.put\('\/api\/settings\/departments\/:id', requireOrganizationWriteAccess,/);
assert.match(source, /app\.delete\('\/api\/settings\/departments\/:id', requireOrganizationDeleteAccess,/);
assert.match(source, /app\.get\('\/api\/settings\/positions', requireOrganizationReadAccess,/);

assert.match(source, /app\.get\('\/api\/ai\/config', requireAiConfigReadAccess,/);
assert.match(source, /app\.put\('\/api\/ai\/config', requireAiConfigWriteAccess,/);
assert.match(source, /app\.post\('\/api\/ai\/config\/test', requireAiConfigWriteAccess,/);

assert.match(source, /const requireCustomerListAccess = createRequireAuth\(authService, PERMISSION_KEYS\.CUSTOMER_LIST\);/);
assert.match(
  source,
  /const requireCustomerReadAccess = createRequireAnyPermission\(authService, \[\s*PERMISSION_KEYS\.CUSTOMER_LIST,\s*PERMISSION_KEYS\.CUSTOMER_PUBLIC_POOL_VIEW,\s*\]\);/,
);
assert.match(source, /const requireCustomerTagSettingsReadAccess = createRequireAuth\(authService, PERMISSION_KEYS\.SETTINGS_CUSTOMER_TAGS\);/);
assert.match(source, /const requireCustomerTagManageAccess = createRequireAuth\(authService, PERMISSION_KEYS\.SETTINGS_CUSTOMER_TAGS, 'write'\);/);
assert.match(source, /requireCustomerRead: requireCustomerReadAccess/);
assert.match(source, /requireLeadRead: requireCustomerTagLeadReadAccess/);
assert.match(source, /requireSettingsRead: requireCustomerTagSettingsReadAccess/);
assert.match(source, /requireManage: requireCustomerTagManageAccess/);
assert.match(source, /createCustomerTagMigrationRouter\(\{[\s\S]{0,160}requireAuth: requireDataMaintenanceWriteAccess/);
assert.match(source, /const requireCustomerCreateAccess = createRequireAuth\(authService, PERMISSION_KEYS\.CUSTOMER_CREATE, 'write'\);/);
assert.match(source, /const requireCustomerUpdateAccess = createRequireAnyPermission\(authService, \[/);
assert.match(source, /const requireCustomerProfileEditAccess = createRequireAuth\(authService, PERMISSION_KEYS\.CUSTOMER_EDIT_PROFILE, 'write'\);/);
assert.match(source, /const requireCustomerTodoWriteAccess = createRequireAuth\(authService, PERMISSION_KEYS\.CUSTOMER_SET_TODOS, 'write'\);/);
assert.match(source, /const requireCustomerTransferAccess = createRequireAuth\(authService, PERMISSION_KEYS\.CUSTOMER_TRANSFER, 'write'\);/);
assert.match(source, /const requireCustomerReleaseAccess = createRequireAuth\(authService, PERMISSION_KEYS\.CUSTOMER_RELEASE_TO_POOL, 'write'\);/);
assert.match(source, /const requireCustomerPublicPoolClaimAccess = createRequireAuth\(authService, PERMISSION_KEYS\.CUSTOMER_PUBLIC_POOL_CLAIM, 'write'\);/);
assert.match(source, /const requireCustomerDeleteAccess = createRequireAuth\(authService, PERMISSION_KEYS\.CUSTOMER_DELETE, 'delete'\);/);
assert.doesNotMatch(source, /const requireCustomer(?:Edit|Assign)Access/);
assert.match(source, /const requireLeadListAccess = createRequireAuth\(authService, PERMISSION_KEYS\.LEADS_LIST\);/);
assert.match(source, /const requireLeadCreateAccess = createRequireAuth\(authService, PERMISSION_KEYS\.LEADS_CREATE, 'write'\);/);
assert.match(source, /const requireLeadConvertAccess = createRequireAuth\(authService, PERMISSION_KEYS\.LEADS_CONVERT, 'write'\);/);
assert.match(source, /const requireLeadEditAccess = createRequireAnyPermission\(authService, \[PERMISSION_KEYS\.LEADS_CREATE, PERMISSION_KEYS\.LEADS_DETAIL\], 'write'\);/);
assert.match(source, /const requireLeadFollowAccess = createRequireAuth\(authService, PERMISSION_KEYS\.LEADS_FOLLOW, 'write'\);/);
assert.match(source, /const requireLeadAssignAccess = createRequireAuth\(authService, PERMISSION_KEYS\.LEADS_FLOW_CONFIG, 'write'\);/);
assert.match(source, /const requireLeadDeleteAccess = createRequireAuth\(authService, '全部', 'delete'\);/);
assert.match(source, /app\.get\('\/api\/customers', requireCustomerReadAccess,/);
assert.match(source, /app\.get\('\/api\/customers\/public-pool-follow-up-operators', requireCustomerReadAccess,/);
assert.match(source, /app\.get\('\/api\/customers\/:id', requireCustomerReadAccess,/);
assert.match(
  source,
  /app\.get\('\/api\/customers\/:id',[\s\S]*?customerListService\.getById\(customerId, req\.currentUser\)[\s\S]*?if \(result\.code !== 0\)[\s\S]*?return;[\s\S]*?resolveCanonicalCustomer\(prisma, customerId\)/,
  '合并跳转前必须先做客户记录级可见性校验，避免泄露主客户与合并台账标识',
);
assert.match(source, /app\.post\('\/api\/customers', requireCustomerCreateAccess,/);
assert.match(source, /app\.post\('\/api\/customers\/:id\/follow-ups', requireCustomerProfileEditAccess,/);
assert.match(source, /app\.get\('\/api\/customers\/:id\/todos', requireCustomerReadAccess,/);
assert.match(source, /app\.get\('\/api\/customer-todos\/my', requireCustomerListAccess,/);
assert.match(source, /app\.post\('\/api\/customers\/:id\/todos', requireCustomerTodoWriteAccess,/);
assert.match(source, /app\.put\('\/api\/customers\/:id\/todos\/:todoId', requireCustomerTodoWriteAccess,/);
assert.match(source, /app\.post\('\/api\/customers\/:id\/todos\/:todoId\/complete', requireCustomerListAccess,/);
assert.match(source, /app\.post\('\/api\/customers\/:id\/todos\/:todoId\/reopen', requireCustomerTodoWriteAccess,/);
assert.match(source, /app\.post\('\/api\/customers\/:id\/todos\/:todoId\/cancel', requireCustomerTodoWriteAccess,/);
assert.match(source, /app\.post\('\/api\/customers\/:id\/release', requireCustomerReleaseAccess,/);
assert.match(source, /app\.post\('\/api\/customers\/:id\/claim', requireCustomerPublicPoolClaimAccess,/);
assert.match(source, /app\.post\('\/api\/customers\/:id\/assign', requireCustomerTransferAccess,/);
const customerCreateRoute = source.slice(
  source.indexOf("app.post('/api/customers',"),
  source.indexOf("app.get('/api/customers',"),
);
assert.match(
  customerCreateRoute,
  /res\.status\(result\.code === 0 \? 201 : result\.code >= 400 && result\.code < 500 \? result\.code : 500\)\.json\(result\);/,
  '新增客户必须保留 409 等明确的业务 HTTP 状态',
);
assert.match(source, /app\.put\('\/api\/customers\/:id', requireCustomerUpdateAccess,/);
assert.match(source, /app\.delete\('\/api\/customers\/:id', requireCustomerDeleteAccess,/);
assert.match(source, /app\.get\('\/api\/leads', requireLeadListAccess,/);
assert.match(source, /app\.post\('\/api\/leads', requireLeadCreateAccess,/);
assert.match(source, /app\.post\('\/api\/leads\/:id\/convert', requireLeadConvertAccess,/);
assert.match(source, /app\.put\('\/api\/leads\/:id', requireLeadEditAccess,/);
assert.match(source, /app\.delete\('\/api\/leads\/:id', requireLeadDeleteAccess,/);
assert.match(source, /app\.post\('\/api\/leads\/:id\/follow-ups', requireLeadFollowAccess,/);
assert.match(source, /app\.post\('\/api\/leads\/:id\/assign', requireLeadAssignAccess,/);
assert.match(source, /app\.post\('\/api\/order-applications', requireOrderCreateWriteAccess,/);
assert.match(source, /app\.get\('\/api\/order-applications', requireOrderApplicationReadAccess,/);
assert.match(source, /app\.get\('\/api\/order-applications\/:id', requireOrderApplicationReadAccess,/);
assert.match(source, /app\.post\('\/api\/order-applications\/:id\/resubmit', requireOrderCreateWriteAccess,/);
assert.match(source, /app\.post\('\/api\/order-applications\/:id\/return', requireOrderReviewWriteAccess,/);
assert.match(source, /app\.post\('\/api\/order-applications\/:id\/reject', requireOrderReviewWriteAccess,/);
assert.match(source, /app\.post\('\/api\/order-applications\/:id\/approve', requireOrderReviewWriteAccess,/);
assert.match(source, /app\.put\('\/api\/orders\/:id', requireOrderEditWriteAccess,/);
assert.match(source, /app\.get\('\/api\/orders', requireOrderReadAccess,/);
assert.match(source, /app\.get\('\/api\/orders\/owner-candidates', requireOrderReadAccess,/);
assert.match(source, /app\.get\('\/api\/orders\/stats', requireOrderReadAccess,/);
assert.match(source, /app\.get\('\/api\/orders\/:id', requireOrderReadAccess,/);
assert.match(source, /app\.delete\('\/api\/orders\/:id', requireOrderDeleteAccess,/);
assert.match(source, /app\.get\('\/api\/deliveries', requireDeliveryReadAccess,/);
assert.match(source, /app\.get\('\/api\/deliveries\/stats', requireDeliveryReadAccess,/);
assert.match(source, /app\.get\('\/api\/deliveries\/creatable-orders', requireDeliveryReadAccess,/);
assert.match(source, /app\.get\('\/api\/deliveries\/:id', requireDeliveryReadAccess,/);
assert.match(source, /app\.post\('\/api\/deliveries\/from-order', requireDeliveryWriteAccess,/);
assert.match(source, /app\.patch\('\/api\/deliveries\/:id\/card', requireDeliveryWriteAccess,/);
assert.match(source, /app\.post\('\/api\/deliveries\/:id\/advance', requireDeliveryWriteAccess,/);
assert.match(source, /app\.post\('\/api\/deliveries\/:id\/revert', requireDeliveryWriteAccess,/);
assert.match(source, /app\.patch\('\/api\/deliveries\/:id\/tasks\/:taskId', requireDeliveryWriteAccess,/);
assert.match(source, /app\.post\('\/api\/deliveries\/:id\/tasks\/:taskId\/attachments', requireDeliveryWriteAccess,/);
assert.match(source, /app\.post\(\s*'\/api\/business-attachments',\s*requireStorageAccess,/);
assert.match(source, /app\.get\('\/api\/business-attachments\/:id', requireStorageAccess,/);
assert.match(
  source,
  /res\.sendFile\(result\.data\.absolutePath, \{ dotfiles: 'allow' \}\);/,
  '鉴权后的业务附件必须支持从 .worktrees 等受控隐藏父目录读取',
);
assert.match(source, /app\.delete\('\/api\/business-attachments\/:id', requireStorageAccess,/);
assert.match(source, /app\.post\('\/api\/deliveries\/:id\/exceptions', requireDeliveryWriteAccess,/);
assert.match(source, /app\.post\('\/api\/deliveries\/:id\/exceptions\/:exceptionId\/resolve', requireDeliveryWriteAccess,/);
assert.match(source, /app\.post\('\/api\/deliveries\/:id\/confirm', requireDeliveryWriteAccess,/);
assert.match(source, /app\.delete\('\/api\/deliveries\/:id', requireDeliveryWriteAccess,/);
assert.match(source, /app\.post\('\/api\/recovery-orders', requireRecoveryCreateAccess,/);
assert.match(source, /canAccessLegacyStorageKey\(req\.currentUser, key, 'read'\)/);
assert.match(source, /canAccessLegacyStorageKey\(req\.currentUser, key, 'write'\)/);
assert.match(source, /getScopedStorageKeys\('assets'\)/);
assert.match(
  source,
  /createRuntimeStorageGetHandler\(\{[\s\S]*filterAssetStorageData/,
  '运行时资产同步必须按当前员工的数据范围过滤',
);
assert.match(runtimeStorageRouteSource, /queryScope\(request\.query\.scope\) !== 'runtime'/);
assert.match(source, /Legacy storage deletion is disabled/);
assert.match(source, /app\.delete\('\/api\/storage', requireDataMaintenanceDeleteAccess,/);
assert.match(
  source,
  /app\.post\('\/api\/crm-migration\/import', requireStorageAccess, createDisabledCrmCustomerImportHandler\(\)\);/,
  '旧 CRM 客户导入入口必须固定返回 410，不得进入任何客户写服务',
);
assert.doesNotMatch(source, /storageService\.importCrmMigration\(/);
