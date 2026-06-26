$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$backupDir = Join-Path $root 'backups'
$portableMysqlDump = Join-Path $env:USERPROFILE '.jixiang-os\mysql\mysql-8.4.10-winx64\bin\mysqldump.exe'
$mysqlDump = if (Test-Path -LiteralPath $portableMysqlDump) {
  $portableMysqlDump
} else {
  'C:\Program Files\MySQL\MySQL Server 8.4\bin\mysqldump.exe'
}
$database = if ($env:JIXIANG_MYSQL_DATABASE) { $env:JIXIANG_MYSQL_DATABASE } else { 'jixiang_os' }
$user = if ($env:JIXIANG_MYSQL_USER) { $env:JIXIANG_MYSQL_USER } else { 'jixiang_os' }
$password = if ($env:JIXIANG_MYSQL_PASSWORD) { $env:JIXIANG_MYSQL_PASSWORD } else { 'jixiang_os_dev' }
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$output = Join-Path $backupDir "$database-$timestamp.sql"

if (-not (Test-Path -LiteralPath $mysqlDump)) {
  Write-Error "mysqldump.exe not found at $mysqlDump"
  exit 1
}

New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

$env:MYSQL_PWD = $password
& $mysqlDump `
  --host=127.0.0.1 `
  --port=3306 `
  --user=$user `
  --default-character-set=utf8mb4 `
  --single-transaction `
  --no-tablespaces `
  --routines `
  --triggers `
  $database |
  Set-Content -LiteralPath $output -Encoding UTF8
$env:MYSQL_PWD = $null

$file = Get-Item -LiteralPath $output
Write-Output "Backup created: $($file.FullName)"
Write-Output "Size: $($file.Length) bytes"

Get-ChildItem -LiteralPath $backupDir -Filter "$database-*.sql" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -Skip 14 |
  Remove-Item -Force
