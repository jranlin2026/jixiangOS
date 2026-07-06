$portableRoot = Join-Path $env:USERPROFILE '.jixiang-os'
$portableMysqlBase = Join-Path $portableRoot 'mysql\mysql-8.4.10-winx64'
$portableMysqlConfig = Join-Path $portableRoot 'mysql-run\my.ini'

if (Test-Path -LiteralPath "$portableMysqlBase\bin\mysqld.exe") {
  $mysqlBase = $portableMysqlBase
  $mysqlConfig = $portableMysqlConfig
} else {
  $mysqlBase = 'C:\Program Files\MySQL\MySQL Server 8.4'
  $mysqlConfig = 'C:\ProgramData\MySQL\MySQL Server 8.4\my.ini'
}

if (-not (Test-Path -LiteralPath "$mysqlBase\bin\mysqld.exe")) {
  Write-Error "mysqld.exe not found at $mysqlBase\bin\mysqld.exe"
  exit 1
}

if (-not (Test-Path -LiteralPath $mysqlConfig)) {
  Write-Error "MySQL config not found at $mysqlConfig"
  exit 1
}

$listener = Get-NetTCPConnection -LocalPort 3306 -State Listen -ErrorAction SilentlyContinue
if ($listener) {
  Write-Output "MySQL is already listening on 3306."
  exit 0
}

Start-Process -FilePath "$mysqlBase\bin\mysqld.exe" -ArgumentList "--defaults-file=`"$mysqlConfig`"" -WindowStyle Hidden
Start-Sleep -Seconds 8

$listener = Get-NetTCPConnection -LocalPort 3306 -State Listen -ErrorAction SilentlyContinue
if ($listener) {
  Write-Output "MySQL started on 3306."
  exit 0
}

Write-Error "MySQL did not start on 3306. Check C:\ProgramData\MySQL\MySQL Server 8.4\Data for error logs."
exit 1
