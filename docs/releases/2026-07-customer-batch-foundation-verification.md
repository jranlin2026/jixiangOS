# 2026-07 客户批量管理基础发布验证

## 发布范围

本批交付客户权限树、三级可配置客户范围（本人、本部门、全部）、稳定负责人身份、六类批量操作、预检确认、后台任务、租约恢复、取消、审计和客户列表操作界面。“本部门”按员工所在组织节点执行，包含该节点的下级部门。共享客户与撤销共享不在本次范围。

## 强制门禁

在生产数据副本上按顺序执行，任何一步非零退出都停止发布：

```bash
pnpm exec tsx scripts/prepare-customer-permission-migration.ts capture --out private_reports/customer-permission-v1.json
pnpm exec tsx scripts/prepare-customer-permission-migration.ts apply-manifest --file private_reports/customer-permission-v1.json
pnpm run db:generate
pnpm run db:deploy
pnpm run customer:demo-fixture-cleanup -- --apply --confirm-production --out private_reports/demo-refunds-v1.json
pnpm exec tsx server/services/customerBatchFoundation.integration.test.ts
pnpm test
pnpm run build
pnpm run customer:permission-audit
pnpm run customer:association-audit -- --dry-run --out private_reports/customer-association-v1.json
pnpm run customer:batch-verify
```

权限审计必须为 `passed: true`；已知演示退款清理必须先将原始记录以 0600 权限备份，且任何固定签名字段被改动时必须拒绝删除；关联审计的 `backfillCandidates` 和 `repairRows` 必须同时为空；批量验证的 `schemaReady`、`idempotencyUnique`、`leaseRecovery`、`staleLeaseFenced`、`cancellation`、`cleanedUp` 必须全部为 `true`。

## 自动验证覆盖

- 历史客户父权限 `read/write/delete/admin` 的 P0 越权矩阵；只有 `read` 可获得列表和详情，任何父权限均不可获得进展、转让、批量、删除、导入、导出、合并或取消。
- 10,000 条允许、10,001 条阻止。
- 数据库复合幂等唯一约束、任务目标唯一约束和空目标约束。
- 过期租约恢复、旧租约围栏、执行中取消只取消未完成明细。
- 自动验证只创建 `qa-cbf-*` 前缀记录，并在结束时清理自己的记录。

## 浏览器验收记录

- 已用具有批量管理与动作叶子权限的账号验证：页内多选、当前筛选结果全选、六类动作按权限显示、操作原因、预检可执行/阻止数量、后台任务提示、任务抽屉及关闭不取消。
- 已验证没有稳定负责人身份的历史数据会被预检阻止；运行正式负责人身份回填后，同一客户预检可执行。
- 已验证桌面布局和 390×844 移动布局；筛选区、批量工具条和操作按钮正常换行，表格保留横向浏览能力。
- 仍需在生产数据副本上用“仅批量管理”和“批量管理+转让”两个真实角色复核 403、部门直属范围、任务关闭后继续运行和取消窗口；未完成前不得生产发布。

## 回滚与保护

- 权限迁移必须先生成并签名清单，不允许绕过基线或猜测删除权限。
- 客户关联审计默认只读；存在未注册、歧义或无法解析的关联时阻止发布。
- 批量验证脚本不读取或输出客户联系方式，不修改真实客户，只操作独立前缀的任务验证记录。
- 生产部署前保留数据库备份和权限清单；若门禁失败，停止应用切换，不以手工改表方式绕过。

## 2026-07-18 本地数据演练结果

- 权限迁移审计：通过，10 个角色的 baseline 版本和 manifest checksum 一致，未发现异常权限或范围变化。
- 批量数据库验证：通过，幂等唯一、过期租约恢复、旧租约围栏、取消和验证记录清理均为 `true`。
- 原报告的 26 条是 19 条业务记录的“关联路径数”，其中普通未转客户线索、手工填写的售后挽回单、订单申请非规范副本和佣金 JSON 副本均属误报，未按姓名猜测绑定。
- 6 条正式订单佣金已依据 `orderId` 指向的正式订单回填数据库 `customerId`；通用存储更新已改为不再用缺失字段清空稳定 ID。
- 10 条固定编号的旧演示退款已先备份后精确清理；发布脚本会在服务器上执行同一个可验证、可拒绝的清理步骤。
- 最终客户关联审计扫描 4,996 条记录、12,589 个关联路径，`backfillCandidates=0`、`repairRows=[]`。
- 全量 214 个测试文件、实时数据库集成验证、生产构建、生产配置检查和 API `health/ready` 均已通过。
