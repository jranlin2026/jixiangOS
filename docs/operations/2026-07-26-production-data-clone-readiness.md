# 极享OS生产数据安全复制、本地恢复、部署与回滚方案

日期：2026-07-26
状态：安全工具已实现但未执行；未执行生产导出、下载、恢复、净化、回填、迁移、部署、重启或配置修改。

## 1. 当前结论

当前**不具备安全复制或正式发布条件**。公网健康检查正常，但服务器 SSH 只读登录被拒绝，因此生产 commit、数据库名、备份目录、真实附件目录、环境变量类别、磁盘空间及现有备份均未获得现场证据。

代码侧已补齐 `uploads-private` 的发布排除、持久目录合并和软链接契约，但仍必须先在服务器只读核验真实配置与历史附件位置，再决定是否发布。

## 2. 已核验的本地状态

- 仓库：`jranlin2026/jixiangOS`。
- 当前分支：`codex/commission-config-unification`。
- 当前 HEAD：`bc2de77 feat(customers): sync missing import metadata`；本地 `main` 同指向该提交。
- 相对 `origin/main`：本地领先 7 个提交。
- 工作树：大量已修改文件和未跟踪文件，当前不能作为可审计的发布源。
- 数据库：MySQL，`127.0.0.1:3306`，数据库名 `jixiang_os`，独立账号已配置；密码未读取或输出。
- API：`127.0.0.1:3001`，本地 `/api/health` 返回 `ok=true,database=true`。
- Prisma：18 个迁移，本地 `prisma migrate status` 显示 schema 已是最新。
- 本地附件候选：`uploads-private`、`private_uploads`；公网文件默认位于 `uploads`。
- 本地真实数据/凭证保护：`.env`、`.local/`、`.mysql/`、`uploads/`、`uploads-private/`、`private_uploads/`、`backups/` 均由 `.gitignore` 规则覆盖。数据库备份仍只能放在明确受忽略的目录内。

本地数据库当前数据只能作为本地基线，不能代替生产核对。业务主体主要位于 `business_records`，系统配置同时分布在结构化表与 `app_storage`。本地读取结果包括客户 1179、订单 52、售后挽回单 6、退款 10、提成 46、提成发放批次 3；这些不是生产数量。

## 3. 生产环境结构：已知约定与待现场确认

仓库当前支持的 ECS 约定：

- 主机：`120.24.250.244`。
- 应用目录：`/opt/jixiang-os`。
- 默认持久目录：`/opt/jixiang-os.data`，或 `.env` 中的 `JIXIANG_PERSISTENT_DATA_DIR`。
- API：PM2 进程 `jixiang-os-api`，监听 `127.0.0.1:3001`。
- 入口：Nginx，公网域名 `https://jixiangos.cn`。
- 数据库：Prisma MySQL，连接由服务器 `.env` 的 `DATABASE_URL` 指定。
- 发布方式：本地 `scripts/deploy/deploy-ecs.py` 打包上传，远端安装依赖、备份、Prisma 检查/迁移、数据门禁、原子目录切换、PM2 重启和 Nginx reload。
- 旧版本目录：`/opt/jixiang-os.prev-*`，脚本保留最近 3 个。

2026-07-26 的公网只读探测：`/api/health` 返回 `ok=true,database=true`，Nginx 返回 200；这只能证明公网/API/数据库探活成功，不能证明数据完整、附件完整或 commit 正确。

以下必须通过服务器只读登录确认，不能从文档推定：

1. `/opt/jixiang-os` 是否为 PM2 当前 cwd、是否是目录或符号链接。
2. 当前代码 commit；发布包通常不包含 `.git`，如无内置版本文件，可能无法准确追溯。
3. `DATABASE_URL` 的主机、端口和库名，以及是否为 ECS 本机 MySQL 或 RDS。
4. `_prisma_migrations` 的实际状态和 schema diff。
5. `uploads`、`private_uploads`、`uploads-private/business-attachments` 的真实路径、符号链接、文件数、容量和权限。
6. `BUSINESS_ATTACHMENT_STORAGE_DIR`、`ENABLEMENT_PRIVATE_STORAGE_DIR`、`JIXIANG_PERSISTENT_DATA_DIR` 是否设置。
7. 备份目录、最近备份、校验文件、剩余磁盘空间和异机副本。
8. 生产 `.env` 仅核对变量名和“是否设置”，不得输出值。

## 4. 数据与配置分布

### 数据库

- 组织与账号：`users`、`roles`、`departments`、`positions`。
- 登录态：`auth_sessions`；复制后必须在本地清空，不能保留可用生产会话。
- 业务主体：`business_records`，按 `domain` 区分客户、订单、退款、挽回单、提成、提成结算批次、提成发放批次、产品、标签等。
- 线索：`lead_records`。
- 系统业务配置：一部分在 `app_storage`，如提成规则/发放方案、订单类型、客户等级、来源、生命周期、组织资料等；一部分在结构化表。
- 业务附件元数据：`business_records.domain='jixiang_os_business_attachments'`；文件本体在文件系统。
- 知识库：`knowledge_*` 表保存元数据，Markdown 原件在私有文件目录。
- 敏感配置：`ai_provider_configs.apiKey`，以及生产会话、账号密码哈希、加密联系信息等，不应原样作为普通本地测试数据使用。

### 文件系统

- 公网矩阵视频：应用 cwd 下的 `uploads/matrix-videos`。
- 知识库私有原件：`ENABLEMENT_PRIVATE_STORAGE_DIR`，默认 `private_uploads/enablement`。
- 订单、售后、交付业务附件：`BUSINESS_ATTACHMENT_STORAGE_DIR`，默认 `uploads-private/business-attachments`。
- 私有审计/修复报告：发布脚本使用持久目录下的 `private_reports`。

附件迁移必须同时复制数据库元数据和文件本体；二者的附件 ID、`storageName` 和文件数量必须一致。

## 5. 生产环境变量类别（只盘点变量名）

- 数据库：`DATABASE_URL`、`JIXIANG_MYSQL_HOST/PORT/DATABASE/USER/PASSWORD`。
- 服务与域名：`NODE_ENV`、`AI_PROXY_HOST/PORT`、`CORS_ORIGINS`、`VITE_*`。
- 初始化与认证：默认管理员/用户密码、setup token、session TTL、登录限流。
- 加密与签名：联系人 HMAC/加密密钥、客户合并快照密钥、权限迁移签名、客户数据交换签名、业务导入签名。
- AI：DeepSeek/API provider 密钥；数据库表中也可能保存 AI provider 配置。
- 存储：`ENABLEMENT_PRIVATE_STORAGE_DIR`、`BUSINESS_ATTACHMENT_STORAGE_DIR`、`JIXIANG_PERSISTENT_DATA_DIR`。
- 备份/部署/冒烟：`JIXIANG_BACKUP_*`、`JIXIANG_DEPLOY_*`、`JIXIANG_SMOKE_*`、Prisma baseline 确认值。

生产密码、Token、签名密钥、AI/短信/邮件/支付/Webhook/云存储密钥不得复制进本地模板、命令、日志或 Git。当前代码未发现短信、邮件、支付或 Webhook 的正式发送实现；AI 是已存在的外部调用能力，本地必须保持无 Key。后续新增外部集成时，应增加统一的副作用总开关和启动时保护。

## 6. 服务器只读盘点命令草案

获得只读 SSH 权限后执行。命令不得 `source .env` 后输出环境，不得运行 deploy、backup、restore、Prisma deploy 或 PM2/nginx 写操作。

```bash
ssh root@120.24.250.244

APP_DIR=/opt/jixiang-os
test -d "$APP_DIR" || { echo "APP_DIR_NOT_FOUND"; exit 1; }
pwd
readlink -f "$APP_DIR"
stat -c '%A %U:%G %s %y %n' "$APP_DIR" "$APP_DIR/.env"
find /opt -maxdepth 1 -type d \( -name 'jixiang-os.prev-*' -o -name 'jixiang-os.new-*' -o -name 'jixiang-os.data' \) -printf '%TY-%Tm-%Td %TH:%TM %p\n' | sort
pm2 jlist | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const p of JSON.parse(s)){if(p.name==="jixiang-os-api")console.log({name:p.name,status:p.pm2_env?.status,cwd:p.pm2_env?.pm_cwd,script:p.pm2_env?.pm_exec_path,restarts:p.pm2_env?.restart_time})}})'
curl -fsS http://127.0.0.1:3001/api/health
node --version
mysql --version
nginx -v
df -h /opt /var/backups 2>/dev/null
```

仅列出环境变量名称与是否设置：

```bash
sed -E 's/^export[[:space:]]+//' /opt/jixiang-os/.env \
  | sed -nE 's/^([A-Za-z_][A-Za-z0-9_]*)=.*/\1=<set>/p' \
  | sort
```

数据库地址只输出协议、主机、端口、库名及账号/密码是否存在，不输出账号和密码值。附件目录必须先从上述三个存储变量解析；任何变量缺失时按代码默认值计算，再用 `readlink -f` 核验，不能猜测。

## 7. 数据库备份命令草案（首次需要明确确认）

从本节开始会创建生产备份文件，必须获得明确确认。优先使用已有脚本，因为它会核对备份目标与 `DATABASE_URL` 一致、使用单事务、校验 gzip、生成 SHA-256，并将权限设为 600。

```bash
cd /opt/jixiang-os
set -a
. ./.env
set +a
bash scripts/mysql/backup-linux.sh
```

执行前必须先只读确认：目标数据库名、备份目录为仓库外绝对路径、可用空间不少于数据库预计大小的 2 倍、数据库用户拥有一致性导出所需权限。执行后只记录文件路径、字节数、时间和 SHA-256，不展示 SQL 内容。

现有备份脚本的限制：它会按保留天数删除旧备份。首次迁移备份应设置一个专用、空的迁移备份目录，避免触碰现有备份；或先调整脚本增加 `--no-prune`，经审查后再运行。

## 8. 下载和本地恢复命令草案

下载是第二个确认点。目标必须在仓库外，且校验和文件一起下载：

```bash
mkdir -p /绝对路径/jixiang-migration-staging
chmod 700 /绝对路径/jixiang-migration-staging
scp root@120.24.250.244:/已确认备份目录/jixiang_os-时间.sql.gz /绝对路径/jixiang-migration-staging/
scp root@120.24.250.244:/已确认备份目录/jixiang_os-时间.sql.gz.sha256 /绝对路径/jixiang-migration-staging/
cd /绝对路径/jixiang-migration-staging
sha256sum -c jixiang_os-时间.sql.gz.sha256
gzip -t jixiang_os-时间.sql.gz
```

恢复是第三个确认点，会写入本地数据库。禁止恢复到当前 `jixiang_os`；先创建全新的隔离库和最小权限账号，例如 `jixiang_os_prod_clone_test`。确认 `DATABASE_URL` 主机是 loopback、库名精确以 `_clone_test` 结尾后，才可执行：

```bash
export JIXIANG_MYSQL_HOST=127.0.0.1
export JIXIANG_MYSQL_PORT=3306
export JIXIANG_MYSQL_DATABASE=jixiang_os_prod_clone_test
export JIXIANG_MYSQL_USER=jixiang_os_clone
read -s -p 'Local clone DB password: ' JIXIANG_MYSQL_PASSWORD; export JIXIANG_MYSQL_PASSWORD; echo
export JIXIANG_CONFIRM_RESTORE=YES
bash scripts/mysql/restore-clone.sh /绝对路径/jixiang-migration-staging/jixiang_os-时间.sql.gz
npm run clone:restore-verify
unset JIXIANG_MYSQL_PASSWORD JIXIANG_CONFIRM_RESTORE
```

`restore-clone.sh` 已强制 loopback、固定库名 `jixiang_os_prod_clone_test`、非 root 最小权限账号、空库、SHA-256、gzip 和明确确认值。`clone:restore-verify` 会继续以只读方式确认克隆库非空、Prisma 迁移表存在且没有未完成迁移；未通过时不得进入净化和岗位预览。通用灾备脚本 `restore-linux.sh` 不承担克隆职责。

## 9. 本地数据去凭证与副作用隔离

恢复完成后，在首次启动应用之前，于本地 clone 库执行一次可审计的净化事务：

1. 清空 `auth_sessions`。
2. 清空 `ai_provider_configs.apiKey` 并禁用 provider。
3. 禁用所有复制来的用户，或把所有账号密码重置为不可登录状态；只创建一个本地专用管理员。
4. 不复制生产 `.env`，使用独立本地模板和全新随机密钥。
5. 联系人加密字段不能配合生产密钥复制。需在“脱敏重建联系人数据”与“受控全真克隆”之间做明确选择；推荐脱敏重建，绝不把生产加密/HMAC 密钥复制到普通开发机。
6. 对手机号、邮箱、微信号、身份证明、附件中的个人信息制定脱敏和最小访问策略。
7. 保持 `DEEPSEEK_API_KEY` 为空；短信、邮件、支付、Webhook、云存储均不配置凭证，并用主机防火墙/代理阻断未知外呼。
8. 所有附件和 dump 仅放在仓库外的 700 权限目录；仓库内仅可使用已忽略的测试目录。

本地环境模板见 `docs/templates/local-production-clone.env.example`。

恢复后先 dry-run，再经单独授权执行净化：

```bash
npm run clone:sanitize
LOCAL_CLONE_ADMIN_PASSWORD='仅本地使用的强密码' npm run clone:sanitize -- --apply --confirm=SANITIZE_PRODUCTION_CLONE
npm run clone:attachments-report
```

三条命令都会拒绝远程主机和非固定克隆库。不得把本地管理员密码写入文档、提交或 shell 历史。

## 10. 附件备份与复制草案

先只读取得三个目录的规范化绝对路径、文件数、总字节数和符号链接目标。任何一个路径不确定都停止。

备份需在生产仓库外创建归档，并生成清单与校验和。命令示意：

```bash
tar --numeric-owner --acls --xattrs -C /已确认持久根目录 -czf /已确认备份目录/jixiang-files-时间.tar.gz uploads private_uploads uploads-private
sha256sum /已确认备份目录/jixiang-files-时间.tar.gz > /已确认备份目录/jixiang-files-时间.tar.gz.sha256
```

不得机械套用上面的三个相对目录；实际目录可能分散，必须根据生产变量逐一归档。下载后先验证 SHA-256，再解压到仓库外隔离目录。恢复时保持：

- 公网文件与私有文件分开。
- 私有目录不可由 Nginx/Express static 暴露。
- 文件权限不放宽。
- 数据库附件元数据数量、`storageName` 去重数量、磁盘实际文件数量、缺失文件、孤儿文件分别核对。

## 11. 数据数量核对方案

生产导出前、本地恢复后、净化后分别生成同一份只读清单并保存为不含 PII 的文本：

```sql
SELECT domain, COUNT(*) AS row_count
FROM business_records
WHERE domain IN (
  'aaos_customers', 'aaos_orders', 'aaos_refunds', 'aaos_recovery_orders',
  'aaos_service_tickets', 'aaos_commissions',
  'aaos_commission_settlement_batches', 'aaos_commission_payout_batches',
  'jixiang_os_business_attachments'
)
GROUP BY domain ORDER BY domain;

SELECT COUNT(*) AS leads FROM lead_records;
SELECT COUNT(*) AS users FROM users;
SELECT COUNT(*) AS prisma_migrations FROM _prisma_migrations
WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;
```

业务口径：

- 客户：`aaos_customers`。
- 订单：`aaos_orders`；另列 `aaos_order_applications`，避免把申请与正式订单混为一谈。
- 售后：分别统计 `aaos_refunds`、`aaos_recovery_orders`、`aaos_service_tickets`。
- 提成：`aaos_commissions`。
- 提成发放：`aaos_commission_payout_batches`；同时列 `aaos_commission_settlement_batches`。
- 业务附件：DB 元数据 `jixiang_os_business_attachments` + 磁盘文件数/总字节/校验清单。

除总量外，再按状态、月份统计，比较金额字段的 `COUNT/SUM/MIN/MAX`；只输出聚合值，不输出客户姓名、手机号或附件名。净化后允许的差异只能是会话、凭证、账号可登录状态和明确批准的脱敏字段。

## 12. 恢复后验证清单

- 数据库主机为 `127.0.0.1`/`localhost`，库名为明确批准的 clone 库。
- MySQL 账号只拥有 clone 库权限。
- 18 个 Prisma 迁移全部 finished，零 rolled back/failed；恢复后先检查，不执行迁移。
- 生产/本地数量与聚合校验相符，净化差异有审计记录。
- `auth_sessions` 为 0，AI provider 已禁用，生产密钥不存在。
- 本地专用管理员可登录，生产账号不可直接登录。
- 不复制生产附件文件；运行 `clone:attachments-report` 生成元数据缺失清单，并用本地测试附件验证上传、预览与权限。
- API 仅监听 loopback；前端仅访问本地 `/api`。
- 模拟短信、邮件、支付、Webhook、AI 调用均无法出网或没有有效凭证。
- 启动、停止、重新创建 clone 库的流程可重复，且不会触碰当前本地 `jixiang_os`。

## 13. 上线前生产备份与正式部署

上线前需单独确认维护窗口和发布 commit，并满足：

1. 工作树干净；commit 已推送并打 release tag；记录依赖/Node 变化。
2. 修复 `uploads-private` 持久化与打包问题并通过测试。
3. 服务器只读盘点、数据库备份、附件归档、SHA-256、异库恢复演练和业务对账全部通过。
4. 记录 PM2 cwd/status、Nginx 配置校验、磁盘空间、现网健康和当前 release 目录。
5. 生成上线前数据库备份和附件归档，不触发旧备份清理；复制一份到服务器外。
6. `prisma migrate status` 无失败、分叉或无法解释的历史；任何 baseline 操作另行授权。
7. 使用唯一支持入口：`python3 -u scripts/deploy/deploy-ecs.py --fresh-install`。迁移后、切换前会先执行资金流水 dry-run；存在缺失时必须另行设置一次性 `JIXIANG_FINANCE_BACKFILL_APPLY=YES` 授权，且 apply 会绑定本次备份 SHA-256。
8. 脚本成功后核对 PM2 cwd、`/api/health`、公网域名、Nginx 与业务冒烟。

不得使用已停用的 `scripts/deploy/deploy-linux.sh`，也不得依据旧文档运行 `prisma db push`。

## 14. 部署失败回滚

代码/服务失败且数据库未迁移时：

1. 停止重试，确认没有第二个部署进程。
2. 核对 PM2 当前 cwd、`/opt/jixiang-os`、最近 `prev-*` 和 `new-*`。
3. 使用部署脚本保留的上一 release 原子切回。
4. 重启/恢复 PM2，校验 Nginx，检查本地和公网 health。
5. 保留失败 release、日志和备份，不清理，直到原因确认。

数据库迁移已执行时：

1. 不手写 down SQL，不盲目回滚数据库。
2. 先保留故障时数据库快照。
3. 若旧代码可兼容新 schema，仅回滚代码。
4. 若必须恢复数据库，在再次明确确认后停止 API，把上线前数据库备份恢复到**已确认的生产目标**，同步恢复与该时间点一致的附件归档，再核对数量和校验和。
5. 恢复后启动旧 release，完成完整冒烟与业务对账。

数据库与附件必须按同一时间点回滚，否则会出现附件元数据与文件本体不一致。

## 15. 线上冒烟清单

- 公网 `/api/health`：`ok=true,database=true`。
- PM2 `jixiang-os-api` online，cwd 为当前 release，无持续重启。
- Nginx 配置有效，HTTPS 证书正常；MySQL 3306 不暴露公网。
- 未登录访问受保护接口返回 401；管理员登录、当前用户、退出正常。
- 客户列表/详情、订单列表/详情、订单审核、售后退款与挽回、交付、提成、提成发放、财务、系统设置可读。
- 用专用烟测数据完成一次最小新增/修改/审核链路，并精确清理烟测数据；不得使用真实客户操作验证。
- 上传并读取一个专用测试附件，确认公网/私有权限边界，再精确删除。
- 核对关键总量和金额聚合未变化。
- 检查 PM2/Nginx 错误日志、磁盘、备份文件及 SHA-256。
- 检查短信、邮件、支付、Webhook、AI 等外部集成只按生产预期发生，无重复触发。

## 16. 明确确认门槛

- 服务器只读登录：需要提供可用的只读 SSH 方式；若只能使用 root 密码，可在交互提示中输入，不能发到聊天或写入命令。
- 第一次必须确认：创建生产数据库备份文件。
- 第二次必须确认：下载数据库和附件到指定的仓库外绝对路径。
- 第三次必须确认：创建/选择本地隔离 clone 库并恢复，精确说明目标库名；不得覆盖当前 `jixiang_os`。
- 第四次必须确认：在本地 clone 上执行净化脚本和创建本地管理员。
- 第五次必须确认：任何生产配置修复、数据库迁移、部署、PM2/Nginx 操作。
- 第六次必须确认：任何生产数据库或附件回滚恢复。

当前下一步仅需只读权限，不需要生产数据库密码明文，也不需要把任何密钥交给本地环境。
