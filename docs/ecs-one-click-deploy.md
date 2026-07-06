# ECS 一键部署

用于后续改完代码后，把本地最新版本发布到阿里云 ECS。

## 第一次使用

安装脚本依赖：

```powershell
python -m pip install paramiko
```

如果系统没有装 Python，但你在 Codex 这台电脑上运行，`scripts\deploy\deploy-ecs.cmd` 会自动尝试使用 Codex 自带的 Python。

## 每次发布

在项目根目录运行：

```powershell
$env:JIXIANG_DEPLOY_HOST="120.24.250.244"
$env:JIXIANG_DEPLOY_USER="root"
$env:JIXIANG_DEPLOY_PASSWORD="服务器密码"
scripts\deploy\deploy-ecs.cmd
```

脚本会自动执行：

1. 本地 `npm run build`
2. 打包代码和 `dist`
3. 上传到 `/opt/jixiang-os`
4. 保留服务器原来的 `.env`
5. 服务器执行 `npm install`
6. 同步 Prisma 数据库结构
7. 重启 `jixiang-os-api`
8. 重载 nginx
9. 检查 `/api/health`

## 常用参数

跳过本地构建：

```powershell
scripts\deploy\deploy-ecs.cmd --skip-build
```

改服务器地址：

```powershell
scripts\deploy\deploy-ecs.cmd --host 120.24.250.244
```

域名和 HTTPS 配好后，可以改成生产环境：

```powershell
$env:JIXIANG_REMOTE_NODE_ENV="production"
scripts\deploy\deploy-ecs.cmd
```

## 注意

- 不要把服务器密码写进代码或提交到 GitHub。
- 现在项目迁移文件还有历史 BOM 问题，所以脚本暂时使用 `prisma db push`；后续整理好迁移后再改成 `prisma migrate deploy`。
- 服务器会保留最近 3 个旧版本目录，路径类似 `/opt/jixiang-os.prev-时间`。
