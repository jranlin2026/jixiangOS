# Task 6 Report — 客户标签管理 UI

## 设计

- 在“系统设置 / 客户设置”增加“客户标签”页，复用现有 MUI 设置页的 Paper、Dialog、Chip 和紧凑表单语言。
- 双栏布局：左侧按 `sortOrder` 展示分组颜色、适用范围、选择模式和启停状态；右侧展示所选分组和同组标签。
- 超级管理员可新增/编辑分组和标签、启停、上下调整排序、合并同组有效标签，以及整理历史标签；其他拥有查看权限的角色保持只读，所有写入口禁用并显示说明。
- 标签只显示使用次数，不提供硬删除。生命周期配置明确指向既有“客户生命周期”页。
- 所有变更等待服务端成功后重新加载目录，不做乐观更新。403、409 和普通服务端错误均保留服务端消息并给出语义前缀。
- 历史标签整理先请求预览，展示客户、线索、引用及缺失名称；必须输入“整理历史标签”，应用时发送预览 checksum。
- 覆盖 loading、empty、error、403、409 状态。

## 文件

- `src/pages/Settings/CustomerTagConfig.tsx`：客户标签目录管理、合并与迁移预览/确认 UI。
- `src/pages/Settings/index.tsx`：在客户设置中注册“客户标签”页及权限键。
- `src/api/customerTagSettingsStatic.test.ts`：页面静态契约测试。

## RED / GREEN

- RED：创建静态契约测试后执行 `pnpm exec tsx src/api/customerTagSettingsStatic.test.ts`，因 `CustomerTagConfig.tsx` 不存在而以 ENOENT 失败，符合预期。
- GREEN：实现页面及设置页接入后，静态契约测试通过。
- 复核修正：合并按钮最初错误依赖弹窗打开后的目标集合；改为按当前标签即时判断同组有效目标，再执行完整验证。

## 验证

使用 bundled Node：`/Users/nge/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin`。

```sh
pnpm exec tsx src/api/customerTagSettingsStatic.test.ts
pnpm exec tsx src/api/customerTagPermissionModel.test.ts
pnpm exec tsx src/api/customerTagApi.test.ts
pnpm exec tsc -b --pretty false
pnpm exec vite build
```

以上命令串行执行，退出码为 0；Vite 成功转换 2862 个模块并生成生产构建。

## 风险

- 本任务没有新增浏览器级组件测试；交互正确性主要由 TypeScript、API/权限契约和静态页面契约保障。

## 复审修订

- 管理页改用显式 `scope=all&includeInactive=true`；路由保留原有 `requireRead` 边界，同时支持 all 并返回 customer、lead、both 全部定义。路由测试用 lead-only 分组验证不会被遗漏。
- 分组保存、标签保存、合并、迁移预览及应用错误全部显示在所属 Dialog 内。增加纯状态测试覆盖 403、409、一般服务端错误和默认错误文案；预览失败显示错误与“重新预览”，不再留下空白内容。
- 迁移应用收到陈旧 checksum 的 409 后立即清空 preview 和 confirmation，显示重新预览提示，确认按钮随之禁用，旧 checksum 无法重复提交。
- 新增 `POST /customer-tags/groups/:id/reorder`：提交整组标签 ID，服务端校验集合完整性，在 active `super_admin` 校验、共享目录行锁及单事务内更新所有 `sortOrder`。UI 不做乐观交换，失败时重新读取目录。
- 服务测试注入中途 update 失败，验证事务完整回滚；聚焦验证增加 `customerTagSettingsState.test.ts`、路由 all-scope/lead-only 和 reorder API 契约。

复审后的聚焦命令：

```sh
pnpm exec tsx src/api/customerTagSettingsStatic.test.ts
pnpm exec tsx src/api/customerTagSettingsState.test.ts
pnpm exec tsx src/api/customerTagApi.test.ts
pnpm exec tsx src/api/customerTagPermissionModel.test.ts
pnpm exec tsx server/customerTagRoutesAuth.test.ts
pnpm exec tsx server/services/customerTagService.test.ts
pnpm exec tsx server/services/customerTagMigrationService.test.ts
pnpm exec tsc -b --pretty false
pnpm exec vite build
```
