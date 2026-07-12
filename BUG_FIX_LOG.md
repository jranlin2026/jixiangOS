# 极享OS Bug 修复日志

> 分支：`main`（由 `codex/fix-stable-release` 本地合并）
> 开始日期：2026-07-11
> 规则：只有实际观察到 RED、完成最小修复并通过 GREEN/回归验证后，状态才能写“已修复”。

## 2026-07-12 独立发布验收（覆盖下方历史基线）

> 本节是基于当前工作区重新安装和重新执行后的最新证据。下方早期“TypeScript/构建通过”记录属于较早修复批次，已被本次结果覆盖。

### 2026-07-12 客户人工标签受控化

| Bug 编号 | 等级 | 问题描述 | 根本原因 | 修改与验证 | 剩余风险 |
|---|---|---|---|---|---|
| CUSTOMER-TAG-001 | P1 | 标签可自由输入，名称不统一且无法可靠筛选 | 客户/线索只保存自由文本，没有权威目录、稳定 ID 和分组规则 | 新增服务端标签目录、单选/多选与范围校验、预设选择器；聚焦 10 条测试命令和 136 个全量测试文件通过 | 真实多角色浏览器验证仍需有效 QA 凭据 |
| CUSTOMER-TAG-002 | P1 | 标签筛选不能表达组内任一、跨组全部等精确条件 | 旧筛选只按标签名称做本地模糊匹配 | 新增服务端 `grouped`/`any`/`all`、无标签和缺组查询；包含数据范围、分页、乱序响应回归 | 大数据量生产查询性能需上线后观察 |
| CUSTOMER-TAG-003 | P1 | 旧自由文本与新目录无法安全衔接 | 没有预览、校验和和幂等迁移过程 | 新增超级管理员专用 preview/apply、目录写锁与审计；服务单测覆盖预览、过期校验和、幂等和写入竞争 | 本轮未连接 QA/生产库，因此真实 preview/apply 数量未取得，生产禁止直接 apply |
| CUSTOMER-TAG-004 | P1 | 标签合并后名称快照、批量导入和迁移同步可能继续使用浏览器旧目录 | 合并误写非领域字段 `manualTagNames`；批量入库和 CRM 同步仍读取或整表覆盖本地标签缓存 | 合并同事务更新 canonical `tags`；批量入库每批只读取一次服务端 active 目录且失败整批终止；CRM 同步改为 await 的记录级 group/tag 命令并处理并发 409 | 未连接真实 QA 数据库，仍需 staging 冒烟 |
| CUSTOMER-TAG-005 | P0 | 历史迁移遇到跨分组同名标签会静默选中任意 ID | 迁移使用 `Map(name → id)`，同名定义覆盖顺序决定归属 | preview 返回歧义名称、组和标签 ID，歧义参与 checksum；apply 在任何业务写入前返回 409，设置页阻止确认并提示先合并或重命名 | 管理员需先治理歧义目录再重新预览 |
| CUSTOMER-TAG-006 | P2 | 表单标签目录缓存可能长期不刷新，失效时旧 pending 请求还可能回写 | 模块级缓存没有 TTL/请求代次，设置页修改目录后也未失效 | 增加 60 秒 TTL、按 scope 的 generation 与显式 invalidation；已挂载组件失效后主动重载，旧代请求丢弃，同代请求去重，失败可重试；所有设置 mutation 与历史整理成功后立即失效 | 多标签页仍依赖 TTL，未增加跨标签页广播 |

本功能最新验证证据：整分支复审修复与缓存竞态聚焦测试全部退出 0；`pnpm test` 为 **138 个测试文件通过**；`pnpm build` 退出 0（2867 modules，未出现 Vite chunk 警告，但 `exceljs.min` 静态资产为 947.70 kB）；`pnpm exec tsc -b --pretty false` 退出 0。Prisma schema 使用示例本地 URL验证通过；未配置真实 `DATABASE_URL`，所以 migration status 和本地 API/浏览器角色冒烟未执行。冒烟脚本同时限制 API/MySQL 回环地址、隔离库命名、精确库名确认和显式破坏性测试开关。自动规则标签和高级人群包明确未实现。

| 项目 | 最新结果 | 证据 |
|---|---|---|
| 提交基线 | `8ee2bef` | 稳定性修复提交，已与 `main` 的 AI 共创模块本地合并验证 |
| 全新安装 | 通过 | 删除生成的 `node_modules` 后执行 `pnpm install --frozen-lockfile`，474 个包安装完成 |
| 启动 | 通过 | API 3001 和 Vite 3003 使用干净进程启动，启动日志无错误 |
| TypeScript | 通过 | `server/services/assetCommandService.ts` 可见性输入类型修正后，`pnpm exec tsc -b --pretty false` 退出 0 |
| Lint | 未配置 | `package.json` 无 lint 脚本 |
| 测试 | 通过 | `pnpm test`，125 个测试文件通过 |
| 构建 | 通过 | `pnpm run build` 退出 0；仅保留大 chunk 警告 |
| Prisma schema | 通过 | `pnpm exec prisma validate` |
| Prisma migration | **失败** | 两个迁移均显示未应用，数据库缺少 `_prisma_migrations` 表 |
| 空库首次启动 | 未验证 | QA 数据库用户无 CREATE DATABASE 权限，无法创建隔离测试库 |
| 生产配置 | **失败** | `NODE_ENV=production pnpm run prod:check` 拒绝当前默认管理员密码 |

### 新发现问题

| Bug 编号 | 等级 | 问题描述 | 根本原因/证据 | 验证结果 | 剩余风险 |
|---|---|---|---|---|---|
| BUILD-001 | P0 | 当前生产构建失败 | `visibleToScope` 错误要求所有资产类型的 `currentUser` 必须非空，与手机号资产可选字段冲突 | 已修复；TypeScript 与生产构建退出 0 | 大 chunk 警告不阻断发布，但后续需优化 |
| CUSTOMER-001 | P0 | 同手机号并发创建产生重复客户 | 客户 create 路径使用随机 ID，缺少历史查重和并发唯一键 | 已修复；规范化手机号后历史查重，并使用手机号 SHA-256 指纹派生确定性记录 ID；真实并发返回 201 + 409 | 若业务未来允许同手机号多主体，需要显式调整唯一性规则 |
| CUSTOMER-002 | P0 | 空姓名、空手机号可创建客户 | 空手机号被手机号格式工具按“无错误”处理，姓名没有服务端必填/长度校验 | 已修复；空姓名/手机号和超过 100 字姓名均返回 400 | 其他可选文本字段仍应逐项补长度上限 |
| MIGRATION-001 | P0 | 现有数据库无迁移基线 | Prisma 显示两条迁移未登记，`_prisma_migrations` 不存在 | `prisma migrate status` 退出 1 | 直接部署迁移可能失败或破坏现有数据 |

### 本轮通过的真实流程

- 未登录客户接口返回 401；销售、财务、交付和只读角色访问设置接口返回 403；管理员可访问。
- 销售访问系统设置被重定向到“无权限访问”，管理员组织设置页正常显示。
- 只读角色客户页不显示新增、分配、放弃到公海按钮，直接 POST 客户返回 403。
- 同一订单申请并发审核两次：一条正常执行、一条幂等重放；数据库最终只有 1 订单、1 提成和 1 交付。
- 负金额订单和空订单返回 400；更新不存在客户返回 404。
- API 与 Vite 的本轮服务日志未出现未解释异常。

### 2026-07-12 阻断修复验证

- RED：客户服务测试观察到空姓名返回成功；真实 API 观察到同手机号两个并发请求均返回 201。
- GREEN：客户聚焦测试、路由状态契约、TypeScript、118 个全量测试文件、生产构建全部通过。
- 真实 API：同手机号并发创建稳定返回一个 201 和一个 409；空姓名返回 400；临时账号和业务记录已清理。

### 2026-07-12 订单与分账回归修复

| Bug 编号 | 等级 | 问题描述 | 根本原因 | 修复与验证 |
|---|---|---|---|---|
| ORDER-OWNER-001 | P1 | 销售负责人筛选与订单表单没有候选人 | 页面误用系统设置用户接口；部门范围依赖不完整浏览器缓存 | 新增服务端 `/orders/owner-candidates`，按订单数据范围返回候选人；真实 API 验证销售仅本人、销售经理为本部门成员 |
| COMMISSION-DEPT-001 | P1 | 新增分账时部门不即时带出，售后挽回显示 `-` | 财务有人员读取权限，但部门/职位仍走系统设置接口并被 403 | 新增受分账权限保护的可分配目录，一次返回人员、部门、职位；订单分账和售后挽回分账统一使用 |
| COMMISSION-ORDER-001 | P1 | 财务首次进入显示“源订单已删除” | 分账汇总只查浏览器订单缓存，访问订单管理前缓存为空 | 分账汇总与状态计数前分页加载服务端可见订单；不再依赖访问顺序 |
| CUSTOMER-CREATE-003 | P1 | 新增客户后后台没有数据且弹窗关闭 | 服务端临时要求手机号必填，与页面“手机号或微信二选一”不一致；store 吞掉 API 错误 | 服务端支持手机号或微信二选一并分别防重；store 传播错误，表单失败不关闭并显示原因；真实 API 仅微信客户返回 201 |

聚焦回归、TypeScript、全量测试和生产构建均通过；构建仍有大 chunk 警告。

### 2026-07-12 公海领取权限拆分

| Bug 编号 | 等级 | 问题描述 | 根本原因 | 修复与验证 |
|---|---|---|---|---|
| CUSTOMER-CLAIM-001 | P1 | 销售专员不能领取公海客户，领取与分配共用同一权限 | 领取路由、服务和前端按钮都复用 `客户/分配客户` | 新增 `客户/领取公海客户`；路由与服务双层校验；内置销售角色迁移到基线版本 2；真实 API 验证 claim=200、claim-only 角色 assign=403 |
| CUSTOMER-PUBLIC-UI-001 | P2 | 公海池仍显示“新增客户”按钮 | 页面头部只校验新增权限，没有校验当前列表作用域 | 公海池作用域不渲染新增按钮，正常客户列表保持不变 |

## 基线

| 项目 | 命令/证据 | 结果 |
|---|---|---|
| Git 分支 | `git branch --show-current` | `codex/fix-stable-release` |
| 未提交内容 | `git status --short --branch` | `.local/`、`.recovery/`、用户方案文档未跟踪；均保持原样 |
| Node 运行时 | 工作区 bundled Node | v24.14.0；系统默认 PATH 未包含 Node，已用明确运行时重跑全部命令 |
| 依赖安装 | `pnpm install --frozen-lockfile` | 通过；lockfile 无变更 |
| TypeScript | `pnpm exec tsc -b --pretty false` | 通过 |
| Lint | `package.json` 当前无 lint 脚本 | 基线缺口 |
| 测试 | `pnpm test` | 通过；107 个测试文件 |
| 生产构建 | `pnpm run build` | 通过；存在大于 500 kB chunk 警告 |
| Prisma schema | `pnpm exec prisma validate` | 通过 |
| Prisma migration | `pnpm exec prisma migrate status` | 失败；本地库有 2 条迁移未登记应用，禁止直接执行 deploy |

## 修复记录

| Bug 编号 | 等级 | 问题描述 | 根本原因 | 修改文件 | 修复方法 | 验证方法 | 验证结果 | 剩余风险 |
|---|---|---|---|---|---|---|---|---|
| SAFE-001 | P0 | `.local/`、`.recovery/` 可能被误提交并泄露本地数据库与明文凭据 | 仓库忽略规则缺少两个运行/恢复目录 | `.gitignore` | 加入忽略；保留用户文件原样 | RED：`git check-ignore -v .local .recovery` 退出 1；GREEN：退出 0 并命中两条规则 | 已修复 | 已暴露过的凭据仍需人工轮换；未删除用户文件 |
| AUTH-001 | P0 | 只读权限可调用员工、角色、AI 配置和清库等高风险写接口 | route middleware 复用了默认 `read` action | `server/index.ts`、`server/storageRoutesAuth.test.ts`、`server/middleware/auth.test.ts` | GET/计数使用 read；创建修改使用 write；用户/角色/部门删除和全库清理使用 delete | RED：路由契约缺少分离中间件；GREEN：路由矩阵、middleware 行为和 TypeScript 通过，独立复核通过 | 已修复 | 前端按钮仍需按 write/delete 权限禁用，后端已失败关闭 |
| AUTH-002 | P0 | `全部/read` 被识别为超级管理员 | fallback 同时信任 roleId 字符串和任意 `全部` 权限，未要求 `admin` action | `src/shared/utils/permissions.ts`、`src/api/permissionModel.test.ts`、`server/services/legacyStorageAccess.test.ts`、`server/services/enablement/knowledgePolicy.test.ts` | 只接受 live super-admin 角色或明确 `全部/admin`；roleId 不再单独提权 | RED：3 个测试均得到 `true !== false`；GREEN：3 个聚焦测试通过，独立复核通过 | 已修复 | 最终仍需全角色 API 回归 |
| AUTH-003 | P0 | 用户 API 暴露密码 Hash/Salt/更新时间 | Prisma 用户 mapper 把数据库认证字段复制到外部 DTO | `server/db/prismaMappers.ts` 及 mapper/settings/storage/auth 回归测试 | mapper 输出白名单移除三个认证字段；数据库内部创建、重置和登录校验保持不变 | RED：mapper/settings/storage 三个入口均检测到字段存在；GREEN：4 个聚焦测试与 TypeScript 通过，独立复核通过 | 已修复 | 历史浏览器缓存需退出重登后清理；已泄露 Hash 仍建议重置密码 |
| CRED-001 | P0 | CRM 迁移共享密码进入前端包和 Git 历史 | 客户端硬编码并批量生成账号 | `src/pages/Settings/CrmMigration.tsx`、`src/api/crmMigrationCredentialSafety.test.ts` | 移除共享凭据和客户端批量建号；安全服务端初始化完成前明确暂停入口 | RED：安全契约检测到泄露字面量；GREEN：契约测试与 TypeScript 通过 | 当前代码已止血 | 历史凭据必须轮换并清理会话；安全批量开通功能待实现 |
| DATA-001 | P0 | 线索/客户局部缓存整表 PUT 会删除服务器其他记录 | 分页/范围投影被误当作全量快照，upsert 后执行 `deleteMany notIn` | `server/services/storageService.ts`、`server/services/storageService.test.ts`、`src/api/businessRecycleBinApi.ts` 及测试 | 线索/客户改为 merge-only；空数组不清库；服务器模式下永久删除在专用 purge 完成前明确拒绝 | RED：线索局部数组触发 `deleteMany notIn`；GREEN：storage/recycle/typecheck 通过，独立复核通过 | 已修复已确认的删库路径 | 同一 ID 陈旧覆盖和其他 legacy 域整表覆盖仍需领域命令；生产数据需先对账 |
| DATA-002 | P0 | 客户放入公海、领取/分配/编辑/删除与线索新建/编辑/跟进/分配/转客户依赖前端整表写，普通员工可出现 403/500、陈旧覆盖和状态回滚 | 核心写操作没有服务端聚合命令、行级数据范围和事务边界；旧整表 PUT 仍可把陈旧浏览器快照写回 | `server/services/customerCommandService.ts`、`server/services/legacyStorageAccess.ts`、`server/index.ts`、`src/api/backendClient.ts`、`src/api/mock/storage.ts`、客户/线索 API 与详情页及回归测试 | 核心操作迁移为记录级服务端命令；行锁+事务+死锁重试；服务端权限/数据范围/操作人校验；服务端与前端双重关闭 CUSTOMERS/LEADS 旧整表写；通用资料更新不再接受负责人/录入人字段；尚未迁移的 AI、回收站恢复、商机联动、产品等级改名和退款完成在服务器模式明确安全暂停 | RED：旧 PUT 仍允许写入，陈旧快照会覆盖公海状态，详情页仍提交归属字段；GREEN：9 个客户/线索命令、旧存储阻断、跨域安全暂停和前端权限定向测试通过，`git diff --check` 通过 | 已修复并关闭已知陈旧覆盖入口 | 被安全暂停的低频功能需后续补记录级命令后恢复；线索/客户 legacy 读取和其他业务域整表写仍需继续收口 |
| AUTH-004 | P0 | Legacy Storage 绕过行级数据范围 | 仅按 storage key 授权 | 待修改 | 关闭核心业务整表读写并迁移记录级 API | 待执行 | 待修复 | 未迁移领域需逐步收口 |
| ORDER-001 | P0 | 订单提交、退回、重提、审核和正式订单维护存在重复、半成功、伪造归属与跨账号缓存风险 | 客户端跨多次异步整表写，缺少事务、行锁、幂等和服务端权威查询 | `server/services/orderApplicationService.ts`、`orderApprovalEffectsService.ts`、`orderCommandService.ts`、`orderQueryService.ts`、`server/index.ts`、订单前端 API/store 及测试 | 订单申请/审核/正式订单改为服务端记录命令；锁定申请/客户，服务端校验稳定 ID 和操作者；审核副作用同事务且可重放；正式订单限制可编辑字段；查询、详情、统计按服务端 data scope 返回；账号切换清缓存；关闭旧整表运行时投影和写入 | 单元/路由/前端契约、TypeScript；真实本地 MySQL + HTTP 两个财务并发审核同一申请 | 已修复；并发结果为一条正常审核、一条幂等重放，最终仅 1 订单、1 提成、1 交付且客户统计只更新一次 | 大数据量后需把 scope/filter/pagination 进一步下推 SQL；发布机时区需确认 Asia/Shanghai |
| DELIVERY-001 | P0 | 交付新建/更新/删除先写交付整表、再写订单整表，员工权限下必然半成功且并发覆盖 | 交付聚合与 `Order.deliveryId` 没有服务端事务边界 | `server/services/deliveryCommandService.ts`、`server/index.ts`、`src/api/deliveryApi.ts`、`src/api/backendClient.ts` 及测试 | 创建、卡片、阶段/任务、附件、异常、验收和删除迁移为记录级命令；行锁+事务同步维护 `Order.deliveryId`；确定性 ID 和重试幂等；服务端 scope/人员 ID/阶段顺序校验 | RED：命令服务/路由/前端分支均缺失；GREEN：服务、路由、backend API、事务回滚、TypeScript 通过 | 核心写路径已修复 | 交付查询仍由 runtime 快照提供，后续需迁移服务端分页/scope 查询 |
| RECOVERY-001 | P0 | 只有“新建挽回单”权限的交付员工收不到完整快照，新建时会把局部数据当整表覆盖服务器 | 新建依赖浏览器整表读改写，且信任客户端操作人/人员归属 | `server/services/recoveryOrderCommandService.ts`、`server/index.ts`、`src/api/recoveryOrderApi.ts` 及测试 | 新建改为服务端单记录事务 create；会话确定操作人；按 `recoveryOrderApplications` scope 校验挽回/协助人员；第三方单号确定性 ID 防重与幂等 | RED：create-only 经旧路径返回失败并依赖整表；GREEN：命令/路由/前端契约、防覆盖/防重/scope、TypeScript 通过 | 新建路径已修复 | 编辑、审核、分账、删除仍待迁移记录级命令；因此 `RECOVERY_ORDERS` 旧写入尚未全面关闭，待下一批次收口 |
| AUTH-005 | P0 | AI 配置可把现有 API Key 发往任意地址 | base URL 无协议/主机校验且连接测试沿用真实 key | `server/services/aiConfigService.ts` 及测试 | 仅允许 DeepSeek 官方 HTTPS 主机；历史不安全 URL 读取时失败关闭到官方端点 | RED：任意 HTTP/主机被接受且 runtime 保留恶意地址；GREEN：4 个 AI 配置测试与 TypeScript 通过 | 已修复 | 若未来支持兼容代理，必须使用显式服务端 allowlist |
| AUTH-006 | P0 | 单一资产子权限可升级为全部资产写权限 | 精确 key 策略包含父权限，而父权限检查会由任一子权限反向满足 | `server/services/assetStorageAccess.ts` 及测试 | 写入按目标 key 的显式模块精确匹配；仅显式父级或超管可写全部资产 | RED：矩阵发布专员可写设备；GREEN：资产/legacy 聚焦测试与 TypeScript 通过 | 已修复 | 资产写入仍需后续 ID/所有者级校验 |
| AUTH-007 | P0 | 管理员正常、销售/财务/交付等员工频繁 Forbidden，销售无法放客户进公海 | 旧组织迁移只在浏览器缓存临时补默认权限，数据库内置角色退化为只读；新后端按动作校验后暴露出系统性权限缺口 | `server/services/roleMigrationService.ts`、`server/services/roleMigrationService.test.ts` | 为内置角色执行一次性服务端权限动作基线恢复，事务写入版本标记；自定义角色不扩权，标记存在后不覆盖管理员后续调整 | RED：销售角色 `CUSTOMER_ASSIGN`/`LEADS_CREATE` 仅 read；GREEN：测试和 TypeScript 通过，真实数据库迁移 7 个角色；销售浏览器完成“放公海→刷新→公海显示→重新领取→客户列表恢复” | 已修复已验证链路 | 仍需完成其他角色的全功能动作回归；迁移只执行一次，后续由管理员显式配置 |
| DATA-003 | P1 | 财务员工仅打开我的提成/分账/月报/规则就提示 Forbidden 或 invalid storage key | 页面读取过程中自动写初始化标记、刷新月度提成，且员工没有对应写权限 | `src/api/mock/storage.ts`、`src/api/commissionApi.ts`、`src/api/mockInitialization.test.ts`、`src/api/commissionOrderSettlementView.test.ts` | backend 初始化只读；月报读取不再隐式刷新持久化数据 | RED：只读请求触发 fetch 写；GREEN：聚焦测试通过，财务五个页签与销售“我的提成”浏览器均为 0 个告警 | 已修复 | 真正调整/确认/发放动作仍需记录级事务命令与动作级按钮门禁 |
| DEPLOY-001 | P0 | 旧发布可在 development 配置下构建、直接破坏性同步 schema，且可丢失上传文件 | 发布脚本缺少生产环境硬门禁、SQL 备份验证、migration baseline 和持久化目录切换 | `scripts/deploy/deploy-ecs.py`、`scripts/mysql/backup-linux.sh`、`server/config/deployEcsSafetyContract.test.ts` | 强制 production/backend 构建；备份与 DB URL 同库校验、gzip/SHA-256/0600/失败清理；只允许 `prisma migrate deploy`；baseline 未人工确认时失败关闭；uploads 迁入版本外持久目录并在停服后最终同步；切换失败恢复旧版 | 安全契约行为测试、生成后 remote shell/backup `bash -n`、`git diff --check`、独立复核 | 代码已修复并独立批准 | 生产 baseline、异库恢复演练和业务对账尚未完成，脚本会继续拒绝发布 |

## 未解决阻断项

- 尚未完成生产 SQL 备份、校验和、异库恢复演练及 `app_storage`/权威表双源对账。
- 已进入前端包/Git 历史的共享凭据与可能复用的服务器凭据必须由管理员轮换。
- 当前没有 lint 命令、CI 和多角色浏览器 E2E；在补齐并通过前不能宣称正式稳定。
