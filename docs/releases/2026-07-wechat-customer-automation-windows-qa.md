# 微信控制极享 OS：Windows 隔离 QA 复验说明

本说明只适用于本机隔离测试库 `jixiang_os_wechat_qa`。它不会创建数据库、覆盖 `.env`、修改生产配置、停止已有进程或部署生产。

## 一键启动前提

在当前 PowerShell 进程中设置测试变量。Token 与签名密钥必须是不同的、至少 32 字符的测试值；不要把实际值写入仓库、聊天或日志。

必须满足：

- `NODE_ENV=development`
- `QA_DATABASE_NAME=jixiang_os_wechat_qa`
- `QA_ALLOW_DESTRUCTIVE_DB=true`
- `DATABASE_URL` 精确指向 `127.0.0.1:3306/jixiang_os_wechat_qa`
- `JIXIANG_WECHAT_AUTOMATION_ACTOR_ACCOUNT=wechat-automation-qa`
- 已设置自动化 Token、签名密钥和授权微信 sender ID
- 本机 MySQL 已监听 `127.0.0.1:3306`
- OpenClaw 已按当前版本配置好 `jixiangos-crm`

然后双击 `scripts/start-wechat-qa.cmd`，或执行：

```powershell
npm run wechat:qa:start
```

启动器会依次执行 Prisma 校验、MCP 测试、OpenClaw 配置校验和实际 MCP 探测。只有工具面精确等于 `jxos_customer_check`、`jxos_customer_create`，并且运行中的 API 通过只读请求证明实际数据库为 `jixiang_os_wechat_qa` 后，才会报告环境可用。

启动器只启动当前未监听的 QA API、前端和 OpenClaw Gateway；不会强制重启或结束任何进程。若端口已被占用，会复用后校验，校验失败即停止。

## 已完成的 Windows 微信验收

2026-07-25 至 2026-07-27 的隔离联调已验证：

- 正常新增客户成功；
- 缺字段时一次只追问一个字段；
- 相同联系方式返回重复摘要，不新增、不覆盖、不合并；
- 指定唯一在职负责人后正确归属；
- 连续重复同一创建动作返回稳定结果，数据库只有一条客户；
- 未授权微信账号不能调用极享 OS 工具；
- 自动化员工停用后立即认证失败且没有写入，恢复员工后链路恢复；
- 目标 Agent 的最终有效工具面只有两个客户工具；
- 审计与 AppStorage 未发现手机号、微信号、sender、Token 或签名密钥泄漏。

以上结果只代表隔离 QA 已通过，不代表允许合并主分支或部署生产。
