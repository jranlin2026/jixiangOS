$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$mysqlStarter = Join-Path $root 'scripts\mysql\start-local-mysql.ps1'

function Test-PortListening {
  param([int]$Port)
  return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Start-ProcessIfPortClosed {
  param(
    [int]$Port,
    [string]$FilePath,
    [string]$Arguments,
    [string]$Name
  )

  if (Test-PortListening -Port $Port) {
    Write-Output "$Name is already listening on $Port."
    return
  }

  Start-Process -FilePath $FilePath -ArgumentList $Arguments -WorkingDirectory $root -WindowStyle Hidden
  Write-Output "Starting $Name on $Port..."
}

powershell -ExecutionPolicy Bypass -File $mysqlStarter

Start-ProcessIfPortClosed -Port 3001 -FilePath 'npm.cmd' -Arguments 'run dev:api' -Name 'API'
Start-ProcessIfPortClosed -Port 3002 -FilePath 'npx.cmd' -Arguments 'vite --host 127.0.0.1 --port 3002 --strictPort' -Name 'Web'

Start-Sleep -Seconds 10

$health = Invoke-RestMethod -Uri 'http://127.0.0.1:3001/api/health' -TimeoutSec 10
$web = Invoke-WebRequest -Uri 'http://127.0.0.1:3002/login' -UseBasicParsing -TimeoutSec 10

Write-Output "Health: $($health | ConvertTo-Json -Compress)"
Write-Output "Login page HTTP: $($web.StatusCode)"
Write-Output "Open: http://127.0.0.1:3002/login"
