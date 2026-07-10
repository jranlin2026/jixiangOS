# 极享OS 核心业务架构重构设计

日期：2026-07-10

状态：总体方案已确认，等待书面规格复核

适用项目：极享OS

## 1. 目标

把当前“浏览器执行业务规则、localStorage 保存业务整表、通用存储接口同步 JSON”的混合架构，渐进迁移为“服务端领域命令、服务端授权、MySQL 权威数据、前端消费授权 DTO”的正式业务系统。

本设计覆盖：

- 线索与公海。
- 客户与客户归属。
- 订单申请、审核和正式订单。
- 交付中心。
- 售后服务与售后挽回。
- 提成规则、分账、确认和发放。
- 财务收支、退款、冲销和汇总。
- 资产、号码、账号、风险、离职回收和敏感信息。
- 跨模块权限、数据范围、事务、审计和数据迁移。

## 2. 明确排除

以下三个半成品模块不进行业务流程、页面结构或领域模型重构：

- 电商结算中心。
- GEO 增长中心。
- AI 助手。

共享基础设施变更仍会影响它们：通用存储会收紧，业务数据不再全量进入 localStorage。迁移期为它们提供只读、受权限约束的兼容接口，但不重新设计其业务功能。

## 3. 已确认的硬约束

1. 现有可用页面在迁移期间保持可操作；每个旧入口只有在新接口接管并通过回归测试后才关闭。
2. 每个领域迁移前必须完成数据库备份、记录数核对和可恢复性检查。
3. 按领域逐步迁移，每个阶段可独立部署、验证和回滚。
4. 不保留永久运行时双写。迁移后的新写只进入新权威模型，旧数据源仅作为只读迁移输入或可丢弃投影。
5. 姓名、公司名、手机号、微信号只能用于搜索或人工消歧，不能充当外键、权限主体或唯一身份。
6. 所有业务权限以服务端当前会话、角色和资源事实为准；前端按钮权限只用于用户体验。
7. 所有新增或改变的行为采用测试先行；测试必须先观察到正确原因的失败，再实现最小修复。
8. 当前工作区未提交的客户列表修复不属于本重构规格，后续提交必须与架构迁移分开。

## 4. 当前架构事实

### 4.1 持久化事实

当前存在三类业务权威来源：

- 浏览器 `localStorage`：前端业务函数的直接读写来源。
- `app_storage`：按 key 保存完整 JSON 值。
- `business_records` / `lead_records`：按 domain 保存 JSON，并投影少量可查询字段。

当前本地恢复数据库抽样已经显示副本漂移：`business_records` 中有 4865 条 customer 记录，而 `app_storage` 的 customers 快照只有 25 条；orders 在 `app_storage` 有 40 条，但没有对应的 `business_records` 记录。因此不能再把任一旧副本直接声明为完整真相，迁移必须先比对和消歧。

### 4.2 权限事实

- `/api/storage` 与 `/api/storage/:key` 主要只验证登录。
- `canReadStorageKey` 和 `canWriteStorageKey` 对非资产 key 默认允许。
- runtime hydration 会向浏览器下发订单、交付、提成、退款、售后和财务等全量数据。
- 客户和线索的专用列表虽然有服务端数据范围，但仍可被通用 storage 绕过。
- 订单、交付、财务、提成和售后的关键权限大多在 React 或 localStorage 角色中判断。

### 4.3 一致性事实

- `setStorageData` 先修改 localStorage，再异步发送整张数组。
- 后端写入错误被吞掉，页面仍可能显示成功。
- 服务端数组写入逐条 upsert 后执行 `deleteMany notIn`，没有版本、事务或冲突检测。
- 订单审核通过会依次更新客户、提成、交付、订单和生命周期。
- 售后与退款会依次更新提成、订单、客户、财务和售后记录。

任何中途失败、并发操作或旧快照覆盖都可能产生半完成状态、丢更新或整域误删。

## 5. 统一领域语言与权威关系

### 5.1 核心实体

| 术语 | 定义 | 权威身份 |
|---|---|---|
| Lead | 尚未建立正式客户关系的客资记录，可处于待分配、跟进或公海状态 | `leadId` |
| Customer | 已建立经营关系的客户主体，保存稳定身份、归属和联系渠道 | `customerId` |
| Ownership | 某条 Lead 或 Customer 在某一时刻的负责人及部门归属 | `ownerUserId`、`departmentId` |
| OrderApplication | 销售提交、等待财务审核的订单申请 | `applicationId` |
| Order | 已通过审核的正式商业事实，保存签约和归因快照 | `orderId` |
| Payment | 正式订单的单次收款事实 | `paymentId` |
| DeliveryCase | 正式订单产生的交付实例，创建时固化阶段快照 | `deliveryId` |
| AfterSalesCase | 售后案件，显式区分退款风险、独立挽回和服务请求 | `caseId` |
| RecoveryOrder | 当前独立售后挽回业务的兼容名称，迁移后表现为一种 AfterSalesCase | `caseId` |
| CommissionEntry | 某个业务来源、某名人员、某个规则快照产生的提成权利 | `commissionEntryId` |
| SettlementBatch | 一次提成确认或发放批次 | `batchId` |
| LedgerEntry | 不可原地改写的财务分录；冲销通过新增反向分录完成 | `ledgerEntryId` |
| Asset | 公司管理的设备、手机号或账号资源 | `assetId` |
| AssetAssignment | 资产与员工、部门之间有起止时间的占用关系 | `assignmentId` |

### 5.2 权威数据关系

```text
Lead --convert--> Customer
Customer --submit--> OrderApplication --approve--> Order
Order --contains--> Payment[]
Order --creates when configured--> DeliveryCase
Order --quotes/confirms--> CommissionEntry[]
AfterSalesCase --may reference--> Customer / Order
AfterSalesCase --quotes/confirms--> CommissionEntry[]
Payment / Refund / Commission payout / Reversal --posts--> LedgerEntry[]
User / Department --holds over time--> AssetAssignment --points to--> Asset
```

关系规则：

- 转客户后 Lead 保留来源事实并引用 `customerId`，但客户联系方式只由 Customer 权威维护。
- Order 必须引用 `customerId`；客户名、销售名、规则名只作为不可用于关联的历史快照。
- DeliveryCase 必须引用 `orderId`，产品交付阶段在创建时固化，不受后续产品配置变化影响。
- AfterSalesCase 可以引用正式订单，也可以标记为独立第三方挽回；两类来源不能共用一个含糊的 `orderId` 字段。
- CommissionEntry 使用带类型的 `sourceType + sourceId`，不再把 RecoveryOrder ID 填进正式订单 ID。
- LedgerEntry 只能追加。已发放提成只能冲销，不能改回“已撤回”并删除历史支出。
- 所有人员关系使用 `userId`，所有组织关系使用 `departmentId`；名称只用于展示快照。

## 6. 目标架构

### 6.1 分层

```text
React 页面
  -> 领域 HTTP client
  -> Express command/query route
  -> AuthorizationPolicy + QueryScope
  -> Application module
  -> Prisma repository + transaction
  -> MySQL typed tables
```

前端只负责表单状态、交互和展示。状态转换、金额计算、权限判断、数据范围、幂等、审计和跨实体一致性全部位于服务端。

### 6.2 深模块边界

#### AuthorizationPolicy

职责：统一功能权限、动作权限、数据范围和敏感字段策略。

主要接口：

```ts
authorize(actor, capability, action, resourceFacts): AuthorizationDecision
buildQueryScope(actor, domain): QueryScope
```

规则：

- 默认拒绝。
- actor 只能来自服务端会话和数据库角色。
- `self`、`department`、`all` 统一翻译为数据库查询条件。
- 部门范围是否包含子部门由单一服务端规则决定。
- 所有 mutation 都重新检查资源范围，不能只依赖列表可见性。

#### AcquisitionLifecycle

职责：线索入库、分配、领取、转客户、客户释放公海和重新认领。

主要接口：

```ts
assignLead(command, actor)
convertLead(command, actor)
releaseCustomer(command, actor)
claimCustomer(command, actor)
```

该模块是 Lead 与 Customer 同步的唯一入口，替代 `leadFlowApi`、`customerApi` 和 `lifecycleSync` 的多点双写。

#### OrderBooking

职责：订单申请、审核、编号、正式订单、付款和订单变更。

主要接口：

```ts
submitApplication(command, actor, idempotencyKey)
reviewApplication(command, actor, expectedVersion)
amendOrder(command, actor, expectedVersion)
recordPayment(command, actor, idempotencyKey)
```

审核通过在同一事务内更新申请并创建正式订单。数据库生成唯一业务编号；重复请求返回同一业务结果。

#### DeliveryApplication

职责：从已入库订单创建交付、推进任务、处理异常和确认完成。

主要接口：

```ts
createFromAcceptedOrder(orderId, actor)
advanceTask(command, actor, expectedVersion)
reportException(command, actor, expectedVersion)
completeDelivery(command, actor, expectedVersion)
```

交付只保留一套创建规则。订单没有配置交付阶段时，不创建 DeliveryCase。

#### AfterSalesApplication

职责：退款风险、独立售后挽回和服务请求的统一案件外壳与各自状态机。

主要接口：

```ts
openCase(command, actor, idempotencyKey)
recordFollowUp(command, actor, expectedVersion)
reviewCase(command, actor, expectedVersion)
completeRefund(command, actor, idempotencyKey)
approveRecovery(command, actor, expectedVersion)
```

旧 Refund、ServiceTicket 和 RecoveryOrder 的公共证据、参与人、客户引用和审计记录合并；各 case type 保留独立且明确的合法状态转换。

#### CommissionSettlement

职责：规则匹配、提成报价、分账草稿、确认、批次发放、发放前撤回和发放后冲销。

主要接口：

```ts
quote(sourceRef, actor)
saveDraft(command, actor, expectedVersion)
confirm(command, actor, expectedVersion)
pay(command, actor, idempotencyKey)
withdrawBeforePay(command, actor, expectedVersion)
reverseAfterPay(command, actor, idempotencyKey)
```

月度阶梯和角色分账算法只保留一个实现。订单页、售后页、我的提成、员工月报和导出均消费同一 read model。

#### FinanceLedger

职责：收款、退款、提成发放和冲销的追加式财务账本及统计投影。

主要接口：

```ts
postPayment(event, idempotencyKey)
postRefund(event, idempotencyKey)
postCommissionPayout(event, idempotencyKey)
postReversal(event, idempotencyKey)
queryLedger(filters, actor)
summarize(period, actor)
```

金额使用数据库 Decimal 或最小货币单位整数。`dailyRecords` 不再是权威数据，只能作为可重建投影。

#### AssetRegistry

职责：设备、手机号、账号、占用关系、转交、退役、风险、离职回收和敏感字段揭示。

主要接口：

```ts
registerAsset(command, actor)
assignAsset(command, actor, expectedVersion)
transferAsset(command, actor, expectedVersion)
retireAsset(command, actor, expectedVersion)
completeOffboarding(command, actor, expectedVersion)
revealSensitiveField(command, actor)
```

级联关系在单一事务中维护。普通 DTO 永远不包含敏感明文；揭示接口必须校验权限、资源范围、二次确认并写审计日志。

## 7. 跨模块数据流

### 7.1 线索转客户

1. 服务端锁定 Lead 并校验版本、领取权限和数据范围。
2. 使用稳定联系渠道查重，返回明确的“新客户、已有关联、需要人工消歧”结果。
3. 在一个事务中创建或关联 Customer、写 Ownership 事件并更新 Lead 引用。
4. 返回 Lead 与 Customer 的授权 DTO；页面不再自行同步两张数组。

### 7.2 订单审核入库

1. 财务提交 `reviewApplication(approve)`，携带申请版本和幂等键。
2. 服务端校验审核权限、申请状态、客户存在性和金额。
3. 一个事务内更新申请、创建 Order、Payment 初始事实和客户投影。
4. 同一数据库事务内按产品配置创建 DeliveryCase 和提成草稿；outbox 只承载通知、分析投影等不影响入库完整性的后续事件。
5. 任一步失败时申请仍保持原状态；重复点击返回同一 Order。

### 7.3 提成发放与财务

1. CommissionSettlement 冻结来源、规则版本、计算基数、人员和金额。
2. 发放批次在同一数据库事务内把待发放条目标记为已发放，并由 FinanceLedger 以幂等键追加支出分录。
3. outbox 只承载通知和外部同步，不承担提成状态与财务分录之间的一致性。
4. 发放后纠错只允许新增反向分录和 adjustment，不允许覆盖原发放记录。

### 7.4 售后

1. 售后案件显式声明类型和来源引用。
2. 退款完成通过 OrderBooking 生成订单调整，通过 FinanceLedger 追加退款分录。
3. 独立挽回审核通过后，通过 CommissionSettlement 生成提成。
4. 旧 Refund 和 ServiceTicket 在历史数据迁移完成后删除，不再继续初始化或同步。

### 7.5 资产

1. 资产查询先应用 QueryScope，再返回脱敏 DTO。
2. 转交、删除和离职回收一次提交完整业务命令。
3. 设备、号码、账号、占用关系、任务、风险和日志在一个事务中提交或全部回滚。
4. 用户退出或切换账号时，所有资产与业务查询缓存统一清空。

## 8. 权限与数据范围设计

每个 route 必须声明：

```text
domain + capability + action + resource lookup + query scope
```

示例：

```text
customers.release + write + customerId + customer ownership scope
orders.approve + review + applicationId + finance review scope
commissions.pay + payout + batchId + finance organization scope
assets.reveal + sensitive_read + assetId + asset ownership scope
```

服务端执行顺序固定为：认证 → 功能权限 → 资源加载 → 数据范围 → 状态前置条件 → 命令执行 → 审计。

通用 `/api/storage` 的目标状态：

- 不再提供业务整库枚举。
- 不接受业务 key 的 PUT 或 DELETE。
- 仅允许受控配置 key，并采用默认拒绝白名单。
- 旧业务 key 在对应领域迁移完成后逐个从兼容白名单移除。
- runtime hydration 只下发会话启动所需的非敏感配置，不下发业务整表。

## 9. 数据库与迁移策略

### 9.1 新权威表

按领域逐步建立 typed tables：

- `leads`、`customers`、`ownership_events`。
- `order_applications`、`orders`、`order_payments`。
- `delivery_cases`、`delivery_stage_snapshots`、`delivery_tasks`。
- `after_sales_cases`、`after_sales_events`。
- `commission_rules`、`payout_plans`、`commission_entries`、`settlement_batches`。
- `ledger_entries`。
- `assets`、`asset_assignments`、`asset_risks`。
- `audit_entries`、`outbox_events`、`idempotency_keys`。

每张核心表至少包含稳定 ID、创建人、更新时间、`version` 和必要的组织归属字段。引用完整性使用真实外键；跨领域展示名称保存为历史快照但不参与关联。

### 9.2 每个领域的迁移步骤

1. 备份当前 MySQL，并记录备份文件校验值。
2. 对旧来源执行记录数、ID、业务编号和关键金额核对。
3. 建新表、约束和只读 legacy adapter。
4. 用幂等迁移脚本导入新表；冲突进入明确的人工消歧报告，不静默合并。
5. 对比旧数据与新 read model 的记录数、状态分布和金额汇总。
6. 前端切到新 query/command，并运行领域回归和浏览器验证。
7. 阻断该领域旧 storage 写入。
8. 观察一个发布周期后移除旧读取和不可达代码。

运行时不同时写新旧权威库。若半成品模块仍需旧结构，服务端从新表生成只读兼容投影；该投影不可作为写入来源。

## 10. 并发、错误、幂等与审计

- mutation 必须 await 服务端结果；错误不得吞掉。
- 可编辑聚合使用 `version` 乐观并发，版本冲突返回 HTTP 409 和最新资源摘要。
- 创建、审核、发放、退款和冲销接受幂等键；重复请求不重复生成业务事实。
- 单领域多表修改使用 Prisma transaction。
- 同一数据库内、决定业务完整性的跨模块写入共享一个 transaction；通知、分析投影和外部系统同步使用 transaction outbox，处理器可重试且自身幂等。
- 所有状态转换记录 actorId、动作、前后状态、原因、时间和关联业务 ID。
- 敏感字段揭示、财务发放、冲销、资产转交和权限拒绝写入安全审计。
- 页面在远端失败时恢复到服务端返回状态，不把仅存在 localStorage 的变化显示为成功。

## 11. 分阶段实施

整个重构拆为七个可独立验收的子项目；每个子项目单独编写实施计划和审查提交。

### 子项目 0：安全止血与迁移底座

- 数据库备份、校验和恢复检查。
- 建立 `AuthorizationPolicy`、统一错误结构、审计骨架和越权回归测试。
- 通用 storage 默认拒绝未知 key；普通用户不能整库枚举，也不能使用通用 DELETE。现有页面临时需要的已登记 key 通过 `LegacyStorageAccessPolicy` 映射到 capability 和 QueryScope，并在对应领域迁移后逐个关闭。
- 显式客户/线索 route 增加 capability/action 校验。
- 修复 fire-and-forget 与错误吞没，所有写入可观察。
- 加入“fresh browser 新建客户不得删除既有数据”和并发覆盖测试。
- 为迁移 key 建立显式清单与逐 key 关闭机制。

### 子项目 1：提成与财务账本

- 建 CommissionSettlement 和 FinanceLedger。
- 修复已发放售后提成可撤回、支出消失的问题。
- 统一正式订单与售后挽回的提成来源模型。
- 迁移 payout plan、规则、提成、批次和财务分录。
- 删除页面端重复金额算法和 `dailyRecords` 权威地位。

### 子项目 2：线索、客户与公海

- 建稳定 Lead/Customer/Ownership 模型。
- 迁移分配、领取、转客户、释放和认领命令。
- 删除按姓名、公司名、手机号直接关联订单或授权的逻辑。
- 统一生命周期和服务端 QueryScope。

### 子项目 3：订单与交付

- 迁移订单申请、审核、正式订单和付款。
- 审核入库原子化并加入幂等与唯一编号。
- 合并两套交付创建规则，固化交付阶段快照。
- 客户统计改为可重建投影。

### 子项目 4：售后服务

- 建 AfterSalesCase 外壳与明确 case type。
- 迁移 RecoveryOrder、仍有价值的 Refund 历史和 ServiceTicket 历史。
- 统一退款、挽回、证据、跟进和审计接口。
- 删除不可达 RefundCenter、旧 store、旧权限别名和初始化副本。

### 子项目 5：资产管理

- 建 AssetRegistry 和 AssetAssignment。
- 统一资源级读写范围，人员关系改用 ID。
- 修复敏感实名、手机号、IMEI、账号和邮箱的脱敏与揭示。
- 把设备、号码、账号、风险和离职回收级联迁入事务。
- 统一用户切换时的缓存清理。

### 子项目 6：移除旧业务存储

- 逐个删除迁移完成的 localStorage API、浅 store 和旧 JSON 写路径。
- `/api/storage` 只保留非业务配置白名单。
- runtime hydration 不再包含任何核心业务整表。
- 删除临时兼容投影和迁移脚本的在线执行入口。
- 完成跨模块数据核对、权限回归、性能测试和恢复演练。

## 12. 第一实施计划的边界

书面规格通过后，第一份实施计划只覆盖“子项目 0：安全止血与迁移底座”。它必须产生可部署、可回滚、不会中断现有页面的独立结果，不同时修改 CRM、财务、售后或资产的领域模型。

第一计划完成的判定：

1. 未登录请求仍为 401。
2. 没有对应模块权限的已登录用户不能调用客户、线索的显式查询或动作接口。
3. 未登记 storage key 默认 403 或 404。
4. 普通用户不能枚举所有 storage 数据，也不能通过通用 DELETE 删除业务域。
5. 后端写入失败会传到调用者并显示失败，不再静默成功。
6. 现有核心页面在受支持角色下仍可正常打开和完成原有动作。
7. 安全测试、现有单元测试、TypeScript 检查、构建和浏览器冒烟测试通过。

## 13. 测试策略

### 13.1 单元测试

- AuthorizationPolicy 的 capability、action、self、department、all 和拒绝默认值。
- 每个状态机的合法与非法转换。
- 提成计算、月度阶梯边界、冲销和金额精度。
- 客户查重消歧、订单审核幂等和交付快照。
- 资产范围、敏感字段 DTO 和级联不变量。

### 13.2 集成测试

- 普通用户不能读取或修改范围外记录。
- 两个客户端基于同一 version 更新，后到请求返回 409。
- 事务任一步失败时所有相关实体保持不变。
- outbox 重试不产生重复订单、提成、付款或财务分录。
- 发放后冲销保留原支出并新增反向分录。
- 数据迁移重复执行结果不变。

### 13.3 浏览器与业务回归

- 线索领取、转客户、客户释放和重新认领。
- 订单提交、财务退回、重新提交、审核入库。
- 交付推进、异常和确认完成。
- 售后审核、分账、发放和冲销。
- 我的提成、员工月报和财务流水口径一致。
- 资产查询、转交、离职回收和敏感字段揭示。
- 退出后切换账号不显示上一账号的业务数据。

## 14. 部署、监控与回滚

- 每个子项目部署前生成数据库备份并验证能读取备份清单。
- 新 route 先在影子模式记录授权结果，再在对应前端切换后启用强制拒绝。
- 迁移脚本输出导入、跳过、冲突和失败数量，并可安全重复执行。
- 关键指标包括 401/403/409/5xx、outbox 积压、命令延迟、迁移差异和前端持久化失败。
- 回滚应用版本不会回写旧权威库；数据库回滚只使用该阶段部署前备份和对应迁移回退说明。
- 发现记录数或金额差异时停止切读，保留旧只读来源并进入人工核对，不自动删除旧数据。

## 15. 被否决的替代方案

### 一次性重建全部关系表

优点是最终结构整齐；缺点是迁移范围、停机风险、历史数据消歧和回滚复杂度过高。它不满足“页面不中断”和“逐域可验证”的硬约束。

### 只整理前端文件和 Zustand store

它可以缩短巨型页面，但无法修复服务端越权、全量数据泄露、整表覆盖、资金状态或数据库漂移，因此不能作为本次重构主方案。

### 永久双写新旧存储

它短期兼容简单，但会制造第四个权威来源并持续放大漂移。设计只允许旧来源只读和新模型生成的兼容投影，不允许长期运行时双写。

## 16. 总体验收标准

重构全部完成时必须同时满足：

1. 核心业务 mutation 全部通过服务端领域命令执行。
2. 核心业务查询全部在服务端应用功能权限和数据范围。
3. localStorage 不保存可作为权威来源的核心业务整表。
4. `/api/storage` 无法读取、覆盖或删除核心业务域。
5. 线索、客户、订单、交付、售后、提成、财务和资产之间只通过稳定 ID 关联。
6. 订单入库、分账发放、退款、冲销和资产级联具有事务、幂等和审计。
7. 财务账本追加不可变，所有报表由同一权威事实聚合。
8. 不可达退款与工单实现完成历史迁移后被删除。
9. 普通 DTO 不泄露资产敏感字段；揭示动作有服务端权限和审计。
10. 电商结算、GEO 和 AI 助手的业务逻辑未被本次重构扩展，只通过受限兼容接口继续运行。
11. 所有子项目的单元、集成、权限、构建和浏览器回归验证通过。
