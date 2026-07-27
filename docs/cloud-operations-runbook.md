# 极享OS 云服务器运维 Runbook

这份文档用于系统已经部署到云服务器之后的日常操作：更新、检查、备份、恢复和回滚。

## 常用目录

```bash
APP_DIR=/var/www/jixiang-os/current
BACKUP_DIR=/var/backups/jixiang-os
API_NAME=jixiang-os-api
```

## 发布更新

推荐使用自动部署脚本：

```bash
cd /var/www/jixiang-os/current
chmod +x scripts/deploy/deploy-linux.sh
scripts/deploy/deploy-linux.sh
```

脚本会按顺序执行：

1. 读取 `.env`
2. 发布前数据库备份
3. `git pull --ff-only`
4. `npm ci`
5. `npm run db:generate`
6. `npm run db:deploy`
7. `npm run build`
8. PM2 启动或重载后端
9. 检查 `http://127.0.0.1:3001/api/ready`

如果要发布后顺带跑公网冒烟检查：

```bash
JIXIANG_SMOKE_BASE_URL=https://你的域名 \
JIXIANG_SMOKE_PASSWORD='管理员密码' \
scripts/deploy/deploy-linux.sh
```

## 冒烟检查

单独运行：

```bash
cd /var/www/jixiang-os/current
chmod +x scripts/deploy/smoke-test.sh
JIXIANG_SMOKE_PASSWORD='管理员密码' scripts/deploy/smoke-test.sh https://你的域名
```

通过标准：

- `/api/ready` 返回 `ok: true`
- `/api/ready` 返回 `database: true`
- 未登录访问 `/api/settings/users` 返回 401
- 管理员可以登录并获得 token
- 登录后访问 `/api/settings/users` 返回 200

## 查看运行状态

```bash
pm2 status
pm2 logs jixiang-os-api --lines 100
curl http://127.0.0.1:3001/api/ready
sudo nginx -t
sudo systemctl status nginx --no-pager
```

## 手动备份

```bash
cd /var/www/jixiang-os/current
set -a
. ./.env
set +a
chmod +x scripts/mysql/backup-linux.sh
scripts/mysql/backup-linux.sh
```

备份文件默认在：

```bash
/var/backups/jixiang-os
```

建议每周至少做一次恢复演练，不要只确认“有备份文件”。

## 从备份恢复

恢复会覆盖目标数据库，必须先确认恢复文件和目标数据库。

```bash
cd /var/www/jixiang-os/current
set -a
. ./.env
set +a

pm2 stop jixiang-os-api
JIXIANG_CONFIRM_RESTORE=YES scripts/mysql/restore-linux.sh /var/backups/jixiang-os/jixiang_os-YYYYMMDD-HHMMSS.sql.gz
npm run db:deploy
pm2 start ecosystem.config.cjs --env production
curl http://127.0.0.1:3001/api/ready
```

恢复后再跑公网冒烟：

```bash
JIXIANG_SMOKE_PASSWORD='管理员密码' scripts/deploy/smoke-test.sh https://你的域名
```

## 回滚代码

如果更新后发现问题，优先回滚代码，不要先动数据库。

```bash
cd /var/www/jixiang-os/current
git log --oneline -5
git revert <问题提交>
npm ci
npm run build
pm2 reload ecosystem.config.cjs --env production
```

如果问题来自数据库迁移，先保留当前数据库备份，再评估是否需要用备份恢复。

## 每周检查清单

- `pm2 status` 为 online
- `sudo certbot renew --dry-run` 正常
- 最近 7 天每天都有 `.sql.gz` 备份
- 至少一份备份已复制到服务器外部位置，例如 OSS
- `scripts/deploy/smoke-test.sh` 能通过
- Nginx 只开放 80/443，MySQL 不暴露公网

## 微信单客户自动化（OpenClaw）

这条链路只允许一个已配对/白名单的微信私人账号，通过 `jixiangos-crm` 代理调用 `jxos_customer_check` 和 `jxos_customer_create`。不包含联系人名片、图片、语音、批量操作、删除、覆盖/合并、阶段变更、客户搜索、跟进创建或主动对外发消息。

### 发布状态与证明边界

| 证明层 | 证明内容 | 不能证明的内容 |
| --- | --- | --- |
| 静态证明 | 代理名、DM 隔离、发件人占位符、精确双工具白名单、对话状态机、verifier 门禁 | 不证明 Windows 上已安装的 OpenClaw/微信插件接受当前配置键 |
| 回环 QA 证明 | 本机 API + 显式 `_qa`/`_test` 目标上的 check/create/replay、状态和客户 ID 稳定性 | 不证明微信发件人授权、OpenClaw 路由或生产数据库安全 |
| Windows/OpenClaw 人工验收 | 微信插件登录、配对/白名单、账号+频道+发件人会话隔离、双工具暴露面 | 不代表已允许生产写入 |
| 生产启用 | 只能在现有 release blockers 全部清除、独立 QA 完成且人工验收签字后进行 | 任一前置缺失都必须保持禁用 |

**当前默认是禁止生产启用。** 没有独立回环 QA 数据库时，只运行静态/config-only 验证，不做 live write。

### 版本漂移警告和官方来源

`integrations/openclaw-jixiangos/openclaw/openclaw.example.json` 是**版本敏感、全量脱敏的结构示例**，不是可直接覆盖的实时配置。OpenClaw 会严格拒绝未知键，微信插件也会随宿主版本变化。替换任何实时配置前，必须以已安装版本的 `openclaw config schema`、`openclaw config validate` 和 MCP/plugin probe 为准；若键不被当前 schema 接受，停止且不启用。

本 runbook 于 2026-07-25 核对了以下官方来源：

- [OpenClaw Config CLI](https://docs.openclaw.ai/cli/config)：`config schema`、`config validate`、`--dry-run` 与写入失败保留旧配置。
- [OpenClaw agent configuration](https://docs.openclaw.ai/gateway/config-agents)：`agents.list`、`bindings`、per-agent `tools.allow` 和 `per-account-channel-peer`。
- [OpenClaw MCP CLI](https://docs.openclaw.ai/cli/mcp)：`mcp add/status/doctor/probe/tools` 和 stdio 配置。
- [OpenClaw slash commands](https://docs.openclaw.ai/tools/slash-commands)：当前会话的 `/tools verbose` 有效工具面。
- [OpenClaw Gateway protocol](https://docs.openclaw.ai/gateway/protocol)：只读 `tools.effective` 会话级投影。
- [OpenClaw pairing CLI](https://docs.openclaw.ai/cli/pairing)：DM sender pairing、多账号参数和首次批准的 command-owner bootstrap 风险。
- [Tencent openclaw-weixin](https://github.com/Tencent/openclaw-weixin)：插件兼容范围、安装、二维码登录、Gateway restart 和 `session.dmScope`。

### 最小权限与环境变量

专用自动化员工账号必须启用，且只授予系统实际权限叶子 `客户/客户列表` 的 `read` 和 `客户/新建客户` 的 `write`，以及创建路径不可避免的最小数据范围。不授予编辑、删除、导入导出、合并、批量、阶段变更、跟进、消息、设置或管理员权限。路由每次请求都会重新读取账号状态与权限，不建立员工登录会话。

| JixiangOS 后端 | OpenClaw MCP 进程 | 关系 |
| --- | --- | --- |
| `JIXIANG_WECHAT_AUTOMATION_TOKEN` | `JIXIANG_OS_AUTOMATION_TOKEN` | 同一个专用 token，只存于密钥管理器/进程环境 |
| `JIXIANG_WECHAT_AUTOMATION_SENDER_ID` | `JIXIANG_OS_WECHAT_SENDER_ID` | **必须精确相同**，都是白名单允许的私人发件人 |
| `JIXIANG_WECHAT_AUTOMATION_ACTOR_ACCOUNT` | 无 | 后端专用员工账号 |
| `JIXIANG_WECHAT_AUTOMATION_SIGNING_KEY` | 无 | 仅后端使用的预检签名密钥 |
| 无 | `JIXIANG_OS_API_BASE` | 生产只用 HTTPS；QA verifier 只接受 loopback |
| 无 | `JIXIANG_OS_CUSTOMER_DETAIL_URL_TEMPLATE` | 必须包含 `{detailPath}` |
| 无 | `JIXIANG_OS_REQUEST_TIMEOUT_MS` | 100–60000 毫秒 |

生成 token 和 signing key 时，分别运行两次下列命令，立即存入密钥管理器，不粘贴到聊天、代码、OpenClaw JSON 模板或命令行参数：

```powershell
node -e "const c=require('node:crypto'); console.log(c.randomBytes(48).toString('base64url'))"
```

### 部署前备份与静态验证

1. 执行本 runbook 前面的数据库备份，并验证备份在服务器外可读。
2. 在 Windows 上查看 `openclaw config file`，复制该文件、OpenClaw 凭据/配对目录和当前服务环境变量清单。备份中的密钥与正本同等敏感。
3. 在仓库根目录运行：

```powershell
npm ci
npm run mcp:openclaw:typecheck
npm run mcp:openclaw:test
npm run wechat:automation:static
npm run wechat:automation:verify
```

`npm run wechat:automation:verify` 默认只读取脱敏配置和工作区文档；成功报告必须是 `mode: static`、`networkRequests: 0`、`databaseWrites: 0`。

### Windows OpenClaw/微信/MCP 安装与 probe

下列 OpenClaw 命令只作为 2026-07-25 官方 CLI 的版本敏感示例。先做只读检查：

```powershell
openclaw --version
openclaw config file
openclaw config schema > openclaw.schema.json
openclaw config validate
openclaw plugins list
openclaw mcp status --verbose
```

对照 Tencent 插件的实际兼容表选择版本。当前官方安装入口为：

```powershell
npx -y @tencent-weixin/openclaw-weixin-cli install
openclaw channels login --channel openclaw-weixin
openclaw config set session.dmScope per-account-channel-peer --dry-run
```

二维码登录会写入本机凭据；必须由 Windows 操作人确认，不做远程代扫。只有 `--dry-run` 通过后才设置 `session.dmScope`。

把 `AGENTS.md` 和 `TOOLS.md` 复制到专用 `<OPENCLAW_AGENT_WORKSPACE>`，不要复用其他代理的 workspace。在 OpenClaw 服务账号环境中注入 MCP 的五个环境变量；不在 `--env`、PowerShell history 或可提交 JSON 中携带真实 token。当安装版本的 `openclaw mcp add --help` 与 schema 确认参数仍有效时，用脱敏占位符构造并先备份：

```powershell
openclaw mcp add jixiangos-crm --command npm.cmd --arg run --arg mcp:openclaw:start --cwd "<REPOSITORY_ROOT>" --include "jxos_customer_check,jxos_customer_create"
openclaw mcp doctor jixiangos-crm --probe
openclaw mcp tools jixiangos-crm --include "jxos_customer_check,jxos_customer_create"
openclaw mcp probe jixiangos-crm --json
```

probe 必须只列出两个工具。出现第三个工具、通配符、shell/文件/浏览器/数据库/通用 HTTP 能力时立即停止。

### 配对、白名单与路由

1. 对 `openclaw.example.json` 中的 `agents.list`、`bindings`、`channels.openclaw-weixin`、`mcp.servers` 逐路径查询实时 schema，不覆盖整个 `openclaw.json`。
2. `dmPolicy`/`allowFrom`/`contextVisibility` 属于插件可能改变的版本敏感键。只能选择当前 schema 支持的“单发件人严格白名单”，或“pairing 后仅保留单发件人”模式；不得选择 open/通配符。
3. binding 必须同时匹配 `channel: openclaw-weixin`、指定 `<WEIXIN_ACCOUNT_ID>`、`peer.kind: direct` 和单一 `<ALLOWLISTED_PRIVATE_SENDER_ID>`。
4. 同一发件人占位符同时填入 OpenClaw allowlist/binding、后端 `JIXIANG_WECHAT_AUTOMATION_SENDER_ID` 和 MCP `JIXIANG_OS_WECHAT_SENDER_ID`。任何不一致都必须失败关闭。
5. 对每个小变更使用 `openclaw config set ... --dry-run`，再使用 `openclaw config validate`。如 schema 不通过，保留旧配置并停止。

微信二维码 `channels login` 只认证插件使用的微信账号，**不等于私聊发件人已配对**。若当前插件 schema 支持 pairing，使用下列版本敏感命令只检查和批准指定账号的单一请求：

```powershell
openclaw pairing list --channel openclaw-weixin --account <WEIXIN_ACCOUNT_ID> --json
openclaw pairing approve --channel openclaw-weixin --account <WEIXIN_ACCOUNT_ID> <PAIRING_CODE>
```

OpenClaw 官方文档警告：当 `commands.ownerAllowFrom` 为空时，首次 CLI pairing approval 会把该发件人同时设为 command owner。CRM 发件人不得因此获得 owner/admin、`/config`、exec approval 或其他命令权限。在 pairing 前，必须用当前 schema 支持的方式将**另一个管理员身份**预先配置为 `commands.ownerAllowFrom`，并分离 `commands.allowFrom`；或改用严格单发件人 allowlist 而不做 pairing。若无法证明 CRM 发件人不是 command owner，停止启用。

配置通过后才重载/重启：

```powershell
openclaw config validate
openclaw gateway restart --safe
openclaw gateway status --require-rpc
openclaw channels status --probe
openclaw mcp doctor jixiangos-crm --probe
```

已安装版本如果不支持 `--safe` 或 `--require-rpc`，查看当地 `--help`，使用该版本支持的等价 restart/status 命令；不得跳过 validate/status/probe。

### 回环 QA verifier（唯一允许的自动写验证）

准备一个不提交的 JSON 文件，所有字段都必须是调用者准备的可丢弃 QA 数据：

```json
{
  "disposableQa": true,
  "customer": {
    "name": "<DISPOSABLE_QA_NAME>",
    "wechat": "<DISPOSABLE_QA_CONTACT>",
    "leadSource": "<QA_LEAD_SOURCE>"
  }
}
```

API 必须是 `localhost`/`127.0.0.1`/`::1`。API 进程的 `DATABASE_URL` 也必须指向回环 MySQL，实际数据库名必须与 API 进程的 `QA_DATABASE_NAME` 以及 verifier 声明的名称完全一致，名称包含 `_qa` 或 `_test` 且任何位置都不含 `prod`、`production`、`live`、`main` 或 `primary`，并且 API 进程必须显式设置 `QA_ALLOW_DESTRUCTIVE_DB=true`。先将 token 和 sender ID 从密钥管理器注入当前进程环境，再运行：

```powershell
npm run wechat:automation:verify -- --live --acknowledge-disposable-qa-write --api-origin=http://127.0.0.1:<LOOPBACK_PORT> --qa-database-name=<EXACT_QA_DATABASE_NAME> --qa-data=<DISPOSABLE_QA_JSON_PATH>
```

live 模式先执行本地门禁：`--live`、loopback origin、安全的 `_qa`/`_test` 数据库名、第二确认 flag、调用者提供的 `disposableQa: true` 文件及进程环境中的 token/sender。首个已认证只读 check 会携带数据库证明请求头；服务端只有在非 production、破坏性 QA 开关开启、数据库主机回环、`DATABASE_URL` 实际库名与两侧 `QA_DATABASE_NAME` 完全一致时，才回传不含 URL/账号/密码的安全库名响应头。证明缺失或不一致时，verifier 在 create 前停止。

证明通过后，它再校验 `ready`、`created`、`replayed` 和稳定客户 ID；随后使用固定非密钥负向凭据发出一个只读 check，必须得到 401。负向检查不读取错误响应体，报告不输出 token、sender ID、客户字段、数据库 URL、凭据或原始响应。四个请求都拒绝 HTTP redirect，避免凭据离开 loopback。一旦 check 表明 `duplicate`，或 create 请求已经发出，任何后续失败都只能提示“QA客户已经或可能存在，必须重置隔离库”，不得声称“未写入系统”。

verifier 不删除、不覆盖也不合并客户。QA 清理只能通过**人工重置该独立数据库**完成，不得通过客户删除接口“清理”。

### Windows/OpenClaw 人工验收

在独立 QA 环境中留存脱敏截图/时间戳和命令结果，逐项验收：

- `openclaw mcp probe jixiangos-crm --json` 只显示精确两个 MCP 工具。这只证明 server/filter，不证明目标会话的最终工具面。
- 从已白名单且已路由到 `jixiangos-crm` 的微信私聊发送单独消息 `/tools verbose`。输出必须只映射到 `jxos_customer_check` 和 `jxos_customer_create`（已安装版本可添加 MCP namespace，但逻辑工具名必须与 probe 一致），不得出现任何 core、shell、文件、浏览器、数据库或消息工具。
- 如需操作员只读交叉检查，先从会话索引确认精确 `<TARGET_SESSION_KEY>`，再按已安装版本 `--help` 确认后运行 `openclaw gateway call tools.effective --params '{"sessionKey":"<TARGET_SESSION_KEY>"}' --json`。它必须与 `/tools verbose` 结果一致；如报 `mcp-not-yet-connected`/类似冷目录提示，先在 QA 会话完成一次预检，再重跑只读投影。
- 白名单私聊纯文本可到达 `jixiangos-crm`；未白名单发件人不能触发工具。
- 确认 CRM 发件人不在 `commands.ownerAllowFrom`，不能运行 owner/admin 命令；一般命令面也只保留人工验收必须的最小读取面。
- 联系人名片、图片和语音不被解析，代理要求改为文本。
- 缺字段时每次只问一个；`duplicate` 立即停止；`ready` 自动创建而不再二次确认。
- 模拟创建超时/断连时只返回安全失败语，必须包含“未写入系统”，不得回显 token 或联系字段。
- 在账号 A/发件人 A 的会话中留一个无敏感唯一标记，再从另一账号或发件人发起私聊；后者不得看到前者标记。然后在原会话中确认标记仍存在，以证明 `per-account-channel-peer` 隔离。
- 将 sender ID 改成不匹配占位值后，后端返回未授权且不创建；恢复前保持代理禁用。

这一层才能证明微信/OpenClaw 授权与会话隔离。静态测试和回环 verifier 都不能替代它。

### 回滚、轮换与失败关闭

回滚顺序：

1. 先从 binding/allowlist 移除 `jixiangos-crm` 路由或停用微信插件，确认新私聊不再到达工具。
2. 停止 Gateway 和 MCP 进程。`openclaw config validate` 默认只验证当前活动路径，所以要在一个新的 PowerShell 进程中将 `OPENCLAW_CONFIG_PATH` 临时指向备份的普通文件，例如 `powershell -NoProfile -Command '$env:OPENCLAW_CONFIG_PATH = "<BACKUP_CONFIG_PATH>"; openclaw config validate'`。外层必须用单引号，避免调用方 PowerShell 在子进程启动前提前展开 `$env:OPENCLAW_CONFIG_PATH`。备份验证通过后再复制回 `openclaw config file` 所示的活动路径，对恢复后的活动配置再运行一次 `openclaw config validate`，最后才重启 Gateway。
3. 撤销后端/MCP 共享 token，停用专用 actor，并检查审计中是否有未预期的 `create_customer_from_wechat`。
4. 不删除已创建的生产客户。QA 数据用独立数据库手工 reset。

轮换 token/signing key 时，先禁用路由，再生成新值；同步更新后端 token 和 OpenClaw MCP token，而 signing key 只更新后端。重启后端与 OpenClaw Gateway，重跑静态和独立回环 QA，再撤销旧值。signing key 轮换会立即使尚未使用的十分钟预检 token 失效，这是预期的失败关闭行为。

任一项出现时保持或恢复禁用：schema/validate/probe 失败；出现额外工具；发件人不一致；不能证明 `_qa`/`_test` 数据库隔离；会话串线；返回原始 token/联系字段；不确定失败声称已写入；现有 release blockers 尚未清除。
