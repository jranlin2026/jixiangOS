# 客户标签弹窗与线索标签下线 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让客户详情页使用分组标签弹窗，并彻底移除线索的人工标签字段、入口与遗留数据。

**Architecture:** 复用现有客户标签目录、单选/多选校验和客户记录级更新命令。新增一个只负责展示与暂存选择的客户标签弹窗；确认后调用现有客户更新接口，让服务端统一校验、持久化并生成客户动态。线索路径停止接受和继承人工标签，并对本机测试数据做一次持久层与浏览器缓存清理。

**Tech Stack:** React 18、TypeScript、MUI、Express、Prisma/MySQL、现有客户标签目录 API、Node `tsx` 回归测试。

## Global Constraints

- 只为客户保留人工标签；不创建第二套标签目录或标签字段。
- 标签组的 `single`/`multiple` 规则与每条客户最多 20 个标签的限制必须继续由现有标签策略校验。
- 不删除客户标签目录、客户标签或 EC CRM 已导入的客户标签。
- 清理范围仅限本机 MySQL 与当前测试浏览器的线索标签缓存；不操作服务器数据。
- 未经用户明确授权，不提交、推送或部署。

---

### Task 1: 让客户标签目录只服务客户

**Files:**
- Modify: `src/shared/components/ManualTagSelector.tsx`
- Modify: `src/shared/utils/customerTagPolicy.ts`
- Modify: `src/pages/Settings/CustomerTagConfig.tsx`
- Test: `src/api/manualTagSelectorStatic.test.ts`
- Test: `src/api/customerDetailTagInputStatic.test.ts`

**Interfaces:**
- Consumes: `CustomerTagCatalog`、`validateManualTagSelection(catalog, 'customer', ids)`。
- Produces: 仅接受 `scope="customer"` 的客户标签选择与展示组件；标签设置页不再提供线索适用范围。

- [ ] **Step 1: 写失败的静态回归检查**

```ts
assert.doesNotMatch(readFileSync(join(projectRoot, 'src/pages/Leads/LeadForm.tsx'), 'utf8'), /ManualTagSelector|manualTagIds/);
assert.doesNotMatch(readFileSync(join(projectRoot, 'src/pages/Settings/CustomerTagConfig.tsx'), 'utf8'), /线索|lead|both/);
```

- [ ] **Step 2: 运行检查确认失败**

Run: `npx.cmd tsx src/api/manualTagSelectorStatic.test.ts`

Expected: FAIL，因为线索表单和标签设置仍包含线索标签路径。

- [ ] **Step 3: 收紧目录与选择器入口**

```ts
// CustomerTagConfig：创建、编辑标签组时固定 scope: 'customer'，移除 scope 选择控件。
// ManualTagSelector / ManualTagDisplay：props.scope 固定为 'customer'，继续使用现有 catalog 缓存、颜色和失效标签回显。
// customerTagPolicy：客户校验只允许 group.scope === 'customer' || group.scope === 'both'，旧 both 数据可继续展示。
```

- [ ] **Step 4: 运行检查确认通过**

Run: `npx.cmd tsx src/api/manualTagSelectorStatic.test.ts; npx.cmd tsx src/api/customerDetailTagInputStatic.test.ts`

Expected: PASS。

### Task 2: 实现客户详情分组标签弹窗

**Files:**
- Create: `src/shared/components/CustomerTagDialog.tsx`
- Modify: `src/pages/Customers/CustomerDetail.tsx`
- Test: `src/api/customerTagDialogStatic.test.ts`

**Interfaces:**
- Consumes: `fetchCustomerTagCatalog('customer', false)`、`validateManualTagSelection`、`CustomerTagCatalog`、`Customer.manualTagIds`。
- Produces: `CustomerTagDialog({ open, initialIds, legacyNames, onClose, onConfirm })`；`onConfirm(ids)` 只在用户点击“确定”时调用。

- [ ] **Step 1: 写失败的组件契约检查**

```ts
assert.match(dialogSource, /设置标签/);
assert.match(dialogSource, /搜索/);
assert.match(dialogSource, /selectionMode === 'single'/);
assert.match(customerDetailSource, /CustomerTagDialog/);
assert.match(customerDetailSource, /\+ 标签/);
```

- [ ] **Step 2: 运行检查确认失败**

Run: `npx.cmd tsx src/api/customerTagDialogStatic.test.ts`

Expected: FAIL，因为客户标签弹窗尚不存在。

- [ ] **Step 3: 创建弹窗并接入客户页头**

```tsx
// CustomerTagDialog：Dialog 标题“设置标签”；左侧 List 显示活跃客户标签组和标签数；
// 右侧按当前组显示 Button/Chip；搜索时显示命中的组与标签；selectedIds 只保存在组件 state。
// 点击 single 组标签时替换该组已选项；点击 multiple 组标签时切换；确认前调用 validateManualTagSelection。
// CustomerDetail：在姓名/负责人信息下方渲染 ManualTagDisplay 和“+ 标签”，不再要求进入“编辑资料”。
```

- [ ] **Step 4: 运行组件检查确认通过**

Run: `npx.cmd tsx src/api/customerTagDialogStatic.test.ts`

Expected: PASS。

### Task 3: 保存标签时写入客户动态

**Files:**
- Modify: `src/pages/Customers/CustomerDetail.tsx`
- Modify: `server/services/customerCommandService.ts`
- Modify: `src/api/customerApi.ts`
- Test: `server/services/customerCommandService.test.ts`
- Test: `src/api/customerTagDialogPersistence.test.ts`

**Interfaces:**
- Consumes: `updateCustomer(id, { manualTagIds })` 和服务端 `updateCustomer(customerId, input, currentUser)`。
- Produces: 客户标签保存后的 `activityRecords[0]`，标题为“更新了客户标签”，`changes` 记录旧标签名与新标签名。

- [ ] **Step 1: 写失败的服务端回归测试**

```ts
assert.equal(updated.activityRecords?.[0]?.title, '更新了客户标签');
assert.deepEqual(updated.activityRecords?.[0]?.changes, [{
  field: 'manualTagIds', label: '客户标签', oldValue: ['旧标签'], newValue: ['新标签'],
}]);
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx.cmd tsx server/services/customerCommandService.test.ts`

Expected: FAIL，因为当前通用更新记录不会将标签变化格式化为可读标签名称。

- [ ] **Step 3: 最小化实现客户标签专用动态与保存回显**

```ts
// customerCommandService：在 manualTagIds 变更时从 catalog 解析前后名称，
// 使用 title: '更新了客户标签' 的 update 动态；其他字段仍沿用既有更新记录。
// CustomerDetail：onConfirm 调用 updateCustomer，成功后 setCurrentCustomer(response.data)，关闭弹窗；失败使用现有 dialog/alert。
// customerApi 的 mock 路径生成与服务端同样的标签变更标题和 changes，保证本地模式一致。
```

- [ ] **Step 4: 运行持久化回归确认通过**

Run: `npx.cmd tsx server/services/customerCommandService.test.ts; npx.cmd tsx src/api/customerTagDialogPersistence.test.ts`

Expected: PASS。

### Task 4: 删除线索标签功能与继承逻辑

**Files:**
- Modify: `src/pages/Leads/LeadForm.tsx`
- Modify: `src/pages/Leads/LeadDetail.tsx`
- Modify: `src/pages/Leads/index.tsx`
- Modify: `src/types/lead.ts`
- Modify: `server/services/customerCommandService.ts`
- Modify: `src/api/leadApi.ts`
- Test: `src/api/leadListTagStyleStatic.test.ts`
- Test: `src/api/leadCommandBackend.test.ts`
- Test: `server/services/customerCommandService.test.ts`

**Interfaces:**
- Consumes: 现有线索创建、更新和转客户命令。
- Produces: `Lead` 不再暴露 `tags` / `manualTagIds`；新建、编辑和转客户不读取、校验或继承线索标签。

- [ ] **Step 1: 写失败的线索标签移除测试**

```ts
for (const path of ['src/pages/Leads/LeadForm.tsx', 'src/pages/Leads/LeadDetail.tsx', 'src/pages/Leads/index.tsx']) {
  assert.doesNotMatch(readFileSync(join(projectRoot, path), 'utf8'), /ManualTagSelector|ManualTagDisplay|预设标签|manualTagIds/);
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx.cmd tsx src/api/leadListTagStyleStatic.test.ts`

Expected: FAIL，因为线索页仍渲染标签列和预设标签输入。

- [ ] **Step 3: 移除线索前端与服务端标签路径**

```ts
// LeadForm、LeadDetail、Leads 列表：删除标签输入、展示、列和筛选；删除 selectedManualTagIds state。
// Lead 类型：删除 tags 与 manualTagIds。
// customerCommandService：删除 createLead/updateLead 的 catalog 校验及 tags 写入；
// 将线索转客户时不再调用 inheritableCustomerTagIds，创建客户的 manualTagIds 与 tags 为空数组。
// leadApi：移除 mock 创建/更新/转换中的线索标签处理。
```

- [ ] **Step 4: 运行线索回归确认通过**

Run: `npx.cmd tsx src/api/leadListTagStyleStatic.test.ts; npx.cmd tsx src/api/leadCommandBackend.test.ts; npx.cmd tsx server/services/customerCommandService.test.ts`

Expected: PASS。

### Task 5: 清理本机遗留线索标签数据并完成端到端验证

**Files:**
- Create then delete after execution: `scripts/clear-local-lead-tags.mts`
- Modify: `src/api/customerTagMigrationApi.test.ts` (only if existing migration tests assert lead tag assignments)
- Test: `server/services/storageService.test.ts`
- Test: `src/api/customerTagDialogStatic.test.ts`

**Interfaces:**
- Consumes: 本机 `.env` 的 `DATABASE_URL`、Prisma `leadRecord`。
- Produces: 本机 `lead_records.data` 不含 `manualTagIds` 或 `tags`；`aaos_leads` 浏览器缓存恢复为空数组。

- [ ] **Step 1: 写清理结果断言**

```ts
assert.equal(cleanupResult.remainingTagFields, 0);
assert.equal(cleanupResult.updatedLeads >= 0, true);
```

- [ ] **Step 2: 执行一次性本机清理脚本**

```ts
// 对每个 leadRecord 读取 data，删除 manualTagIds 和 tags 后 update({ data })；
// 输出 { updatedLeads, remainingTagFields }；随后删除该临时脚本，不将其纳入产品代码。
```

- [ ] **Step 3: 验证浏览器与数据状态**

Run: `npx.cmd tsx server/services/storageService.test.ts; npm.cmd run build`

Expected: PASS；本机线索标签字段为零。

- [ ] **Step 4: 浏览器验收**

Run through the in-app browser:

```text
客户详情 -> + 标签 -> 切换标签组/搜索 -> 选择标签 -> 确定
```

Expected: 客户头部立即出现彩色标签，动态出现“更新了客户标签”；线索列表、新建和详情均无标签入口，页面无框架错误。

## Self-Review

- Spec coverage: Task 1 保留并收紧客户标签目录；Task 2 复刻分组弹窗交互；Task 3 处理保存与动态；Task 4 下线线索标签；Task 5 清理本机遗留数据并做浏览器验收。
- Placeholder scan: 本计划不含 TBD、TODO 或“稍后实现”步骤。
- Type consistency: 客户标签仍使用 `manualTagIds`；线索路径移除该字段；弹窗只调用客户 `updateCustomer`。
