# 微信新增客户自动化 V1 验证记录

> 验证日期：2026-07-25
> 分支：`codex/wechat-control-v1`
> 分支基线：`cb3be5e`
> 验证对象：`91a89fc0c01ccc21cb5b299d83a0655aafc29297` 及后续审查修复提交

## 结论

代码、MCP 工具面、OpenClaw 静态策略和默认零写入验收器已通过本地自动门禁。当前只能判定为“可进入隔离 QA 与 Windows/OpenClaw 人工联调”，不能判定为“已完成真实微信链路验收”或“可生产上线”。

## 自动化证据

| 门禁 | 结果 | 证据 |
|---|---|---|
| 服务端聚焦测试 | 通过 | 自动化密钥/凭证、联系方式身份、核对/创建、HTTP 路由、运行时/生产配置与路由鉴权测试全部退出 0 |
| MCP 聚焦测试 | 通过 | `npm run mcp:openclaw:test` 退出 0；内存 MCP 客户端只发现两个工具 |
| MCP TypeScript | 通过 | `npm run mcp:openclaw:typecheck` 退出 0 |
| OpenClaw 静态策略 | 通过 | `npm run wechat:automation:static` 退出 0 |
| 默认验收器 | 通过 | `npm run wechat:automation:verify` 输出 `mode=static`、`networkRequests=0`、`databaseWrites=0` |
| 完整测试 | 通过 | `npm test` 退出 0，278 个测试文件通过 |
| 生产构建 | 通过 | `npm run build` 退出 0，`tsc -b` 与 Vite 生产构建完成 |
| Prisma schema | 通过 | 使用回环测试 URL 执行 `npx prisma validate`，`prisma/schema.prisma` 有效 |
| 生产配置检查 | 通过 | 使用完整的非真实安全测试值执行 `npm run prod:check`，退出 0 |
| 分支差异检查 | 通过 | `git diff --check cb3be5e` 无错误；`git diff --name-only cb3be5e | wc -l` 为 39 |

`npm test` 中既有的实时数据库集成测试因当前未设置 `DATABASE_URL` 而跳过；这不能替代隔离 QA 数据库验收。

## 分支安全审计

- 从基线到验证对象共变更 39 个路径；没有 Prisma schema 或 migration 变更。
- `package-lock.json` 增加 289 行，对应显式加入的官方 MCP SDK 与传递依赖；未发现无关 lockfile 重写。
- MCP 注册表面严格限定为 `jxos_customer_check` 和 `jxos_customer_create`，不包含 shell、文件、数据库、浏览器或任意 HTTP 能力。
- 差异中未发现私钥文本或真实 Bearer 凭据。手机号、微信号、token 字符仅出现在合成测试夹具和脱敏回归断言中，不是真实客户或生产凭据。
- 自动化幂等记录、审计自由文本和 MCP 诊断的测试覆盖了联系方式、sender、Bearer 与 precheck token 不泄漏。

## 隔离 QA：外部待执行

本轮没有可用的回环极享OS API、隔离 `_qa`/`_test` 数据库和专用 QA 凭据，因此没有执行 live verifier，也没有创建任何真实客户。下列项必须在隔离环境补齐：

1. 成功 check 后 create，并对同一凭证 replay，数据库仅一条客户。
2. 缺联系方式返回单字段追问，补充后继续。
3. 手机号或微信精确重复时不新增，只返回当前权限允许的安全摘要。
4. 指定唯一在职销售后正确归属；同名、离职、越权均失败关闭。
5. 客户详情和审计中可见 `create_customer_from_wechat`、自动化员工、request ID 和幂等键，且不含原始联系方式。
6. 停用自动化员工或更换服务端密钥后，旧链路立即失败关闭。

live verifier 只能在显式 `--live`、回环 API origin、安全数据库名及第二次一次性写入确认同时满足时执行。create 前的已认证只读 check 还必须从 API 获得数据库身份证明：服务端当前 `DATABASE_URL` 的回环数据库名与服务端 `QA_DATABASE_NAME`、verifier 声明完全一致，包含 `_qa`/`_test`、不含生产词，且 `QA_ALLOW_DESTRUCTIVE_DB=true`。响应只回传安全库名，不回传或记录数据库 URL/凭据；证明失败时不得调用 create。

## Windows / OpenClaw：人工待验收

- 根据当前 Windows OpenClaw 版本先执行 config/schema probe，不直接覆盖正在使用的配置。
- 安装/构建 MCP，探测只有两个工具，重启 Gateway，再用 `/tools verbose` 和 `tools.effective` 确认 `jixiangos-crm` 的最终有效工具面。
- 只配对与 allowlist 中的指定私聊账号，确认 `per-account-channel-peer` 会话不串线，且 CRM 账号不是 command owner。
- 手工验证未授权微信账号不能调用任何极享OS 工具。
- 手工验证纯文本与引用文本；图片、语音和联系人名片仍为不支持范围。
- 备份配置，演练密钥轮换和回滚，保存不含 PII/密钥的验收记录。

## 生产启用阻断

生产密钥、生产 API 地址和正式微信 sender 尚未配置，也不应在本地自动验证中配置。此外，`RELEASE_CHECKLIST.md` 当前结论仍是“不能发布”，至少包含以下未完成门禁：

- 现有数据库 Prisma migration baseline 的建立与核验。
- 真实生产管理员密码的强度配置与生产环境 `prod:check`。
- lint/CI 门禁、空库迁移/初始化/首启、完整角色与核心业务回归。
- 生产备份、校验、异库恢复与数据对账演练。
- 客户标签等既有功能在隔离数据库和真实角色下的 API/浏览器冒烟。

在上述门禁、隔离 QA 和 Windows/OpenClaw 人工验收全部通过前，必须保持微信自动化生产禁用。
