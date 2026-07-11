# Phase 0 安全底座发布与恢复手册

本手册适用于“安全止血与迁移底座”发布。数据库密码只能保存在仓库外的 MySQL defaults 文件中，例如 $HOME/.jixiangos-mysql.cnf；不得把该文件、备份文件或密码提交到仓库。

## 发布前备份与恢复校验

    export JIXIANGOS_BACKUP_DIR="$HOME/jixiangos-backups/phase-0-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$JIXIANGOS_BACKUP_DIR"
    mysqldump --defaults-extra-file="$HOME/.jixiangos-mysql.cnf" --single-transaction --routines --events --no-tablespaces jixiang_os --result-file="$JIXIANGOS_BACKUP_DIR/jixiang_os.sql"
    shasum -a 256 "$JIXIANGOS_BACKUP_DIR/jixiang_os.sql" > "$JIXIANGOS_BACKUP_DIR/jixiang_os.sql.sha256"
    mysql --defaults-extra-file="$HOME/.jixiangos-mysql.cnf" -e "CREATE DATABASE IF NOT EXISTS jixiang_os_phase0_restore_check"
    mysql --defaults-extra-file="$HOME/.jixiangos-mysql.cnf" jixiang_os_phase0_restore_check < "$JIXIANGOS_BACKUP_DIR/jixiang_os.sql"
    mysql --defaults-extra-file="$HOME/.jixiangos-mysql.cnf" -N -e "SELECT COUNT(*) FROM jixiang_os.business_records; SELECT COUNT(*) FROM jixiang_os_phase0_restore_check.business_records"

最后一条命令的两个数量必须相等。若不相等，停止发布，保留备份并排查恢复过程。

## 发布验证

1. 未带登录 token 访问任一业务 route 返回 401。
2. 无客户列表权限的账号访问 GET /api/customers 返回 403。
3. 仅有客户列表权限的账号无法发表跟进或释放客户到公海。
4. 普通账号不能访问未登记 storage key，不能无 scope 枚举 /api/storage，不能删除 /api/storage/:key。
5. 新浏览器新建客户后，刷新客户列表仍保留旧客户和新客户。
6. 服务端返回 403 或 500 时，页面显示“数据未保存：”开头的错误提示。

## 回滚

优先恢复发布前的应用版本。此阶段没有 Prisma schema migration，因此正常应用回滚不应修改数据库。

只有当发布过程额外执行了数据库变更时，才使用发布前备份恢复数据库。不要调用 DELETE /api/storage/:key；该接口在本阶段已被禁用。
