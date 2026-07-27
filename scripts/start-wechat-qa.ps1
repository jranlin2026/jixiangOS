[CmdletBinding()]
param(
  [switch]$SkipGateway
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$root = Split-Path -Parent $PSScriptRoot
$expectedDatabase = 'jixiang_os_wechat_qa'
$expectedTools = @('jxos_customer_check', 'jxos_customer_create')
$apiBase = 'http://127.0.0.1:3001'
$webBase = 'http://127.0.0.1:3002'
$gatewayPort = 18789
$portableRoot = Join-Path $env:USERPROFILE '.jixiang-os'
$portableNode = Join-Path $portableRoot 'node\node-v24.18.0-win-x64'
$portableMysqlBin = Join-Path $portableRoot 'mysql\mysql-8.4.10-winx64\bin'

foreach ($toolPath in @($portableNode, $portableMysqlBin)) {
  if (Test-Path -LiteralPath $toolPath) {
    $env:Path = "$toolPath;$env:Path"
  }
}

function Require-EnvironmentValue {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [int]$MinimumLength = 1
  )

  $value = [Environment]::GetEnvironmentVariable($Name, 'Process')
  if ([string]::IsNullOrWhiteSpace($value) -or $value.Trim().Length -lt $MinimumLength) {
    throw "$Name must be set in this PowerShell process and contain at least $MinimumLength characters."
  }
  return $value.Trim()
}

function Test-PortListening {
  param([Parameter(Mandatory = $true)][int]$Port)
  return [bool](Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Wait-HttpReady {
  param(
    [Parameter(Mandatory = $true)][string]$Uri,
    [int]$Attempts = 30
  )

  for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
    try {
      $response = Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec 2
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
        return
      }
    } catch {
      if ($attempt -eq $Attempts) { throw }
    }
    Start-Sleep -Seconds 1
  }
  throw "Timed out waiting for $Uri."
}

function Start-LocalProcessIfPortClosed {
  param(
    [Parameter(Mandatory = $true)][int]$Port,
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [Parameter(Mandatory = $true)][string]$Name
  )

  if (Test-PortListening -Port $Port) {
    Write-Output "$Name is already listening on loopback port $Port; it will be verified before use."
    return
  }

  Start-Process -FilePath $FilePath -ArgumentList $Arguments -WorkingDirectory $root -WindowStyle Hidden
  Write-Output "Starting $Name on loopback port $Port..."
}

function Wait-GatewayReady {
  param([int]$Attempts = 30)

  for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
    & openclaw.cmd gateway health *> $null
    if ($LASTEXITCODE -eq 0) { return }
    if ($attempt -lt $Attempts) { Start-Sleep -Seconds 1 }
  }
  throw 'OpenClaw QA gateway did not become healthy.'
}

function Collect-ToolNames {
  param([Parameter(Mandatory = $true)]$Node)

  $names = [System.Collections.Generic.List[string]]::new()
  if ($null -eq $Node) { return $names }
  if ($Node -is [System.Collections.IEnumerable] -and $Node -isnot [string]) {
    foreach ($item in $Node) {
      foreach ($name in (Collect-ToolNames -Node $item)) { $names.Add($name) }
    }
    return $names
  }
  if ($Node -is [pscustomobject]) {
    foreach ($property in $Node.PSObject.Properties) {
      if ($property.Name -eq 'tools' -and $property.Value -is [System.Collections.IEnumerable]) {
        foreach ($tool in $property.Value) {
          if ($tool -is [pscustomobject] -and $tool.PSObject.Properties.Name -contains 'name') {
            $names.Add([string]$tool.name)
          }
        }
      }
      foreach ($name in (Collect-ToolNames -Node $property.Value)) { $names.Add($name) }
    }
  }
  return $names
}

if ((Require-EnvironmentValue -Name 'NODE_ENV') -ne 'development') {
  throw 'NODE_ENV must be development.'
}
if ((Require-EnvironmentValue -Name 'QA_DATABASE_NAME') -ne $expectedDatabase) {
  throw "QA_DATABASE_NAME must be exactly $expectedDatabase."
}
if ((Require-EnvironmentValue -Name 'QA_ALLOW_DESTRUCTIVE_DB') -ne 'true') {
  throw 'QA_ALLOW_DESTRUCTIVE_DB must be true.'
}

$databaseUrlText = Require-EnvironmentValue -Name 'DATABASE_URL'
try {
  $databaseUri = [Uri]$databaseUrlText
} catch {
  throw 'DATABASE_URL must be a valid MySQL URL.'
}
$databaseName = [Uri]::UnescapeDataString($databaseUri.AbsolutePath.TrimStart('/'))
if (($databaseUri.Scheme -notin @('mysql', 'mysql2')) -or
  ($databaseUri.Host -ne '127.0.0.1') -or
  ($databaseUri.Port -ne 3306) -or
  ($databaseName -ne $expectedDatabase)) {
  throw "DATABASE_URL must point exactly to mysql://127.0.0.1:3306/$expectedDatabase."
}

$automationToken = Require-EnvironmentValue -Name 'JIXIANG_WECHAT_AUTOMATION_TOKEN' -MinimumLength 32
$signingKey = Require-EnvironmentValue -Name 'JIXIANG_WECHAT_AUTOMATION_SIGNING_KEY' -MinimumLength 32
$actorAccount = Require-EnvironmentValue -Name 'JIXIANG_WECHAT_AUTOMATION_ACTOR_ACCOUNT'
$senderId = Require-EnvironmentValue -Name 'JIXIANG_WECHAT_AUTOMATION_SENDER_ID'
if ($actorAccount -ne 'wechat-automation-qa') {
  throw 'JIXIANG_WECHAT_AUTOMATION_ACTOR_ACCOUNT must be wechat-automation-qa.'
}
if ($automationToken -eq $signingKey) {
  throw 'The automation token and signing key must be different test values.'
}

$env:JIXIANG_OS_API_BASE = $apiBase
$env:JIXIANG_OS_AUTOMATION_TOKEN = $automationToken
$env:JIXIANG_OS_WECHAT_SENDER_ID = $senderId
$env:JIXIANG_OS_CUSTOMER_DETAIL_URL_TEMPLATE = "$webBase{detailPath}"
$env:JIXIANG_OS_REQUEST_TIMEOUT_MS = '5000'

if (-not (Test-PortListening -Port 3306)) {
  throw 'Local MySQL is not listening on 127.0.0.1:3306. Start the isolated local MySQL instance first.'
}

Push-Location $root
try {
  & npx.cmd prisma validate
  if ($LASTEXITCODE -ne 0) { throw 'Prisma validation failed.' }

  & npm.cmd run mcp:openclaw:test
  if ($LASTEXITCODE -ne 0) { throw 'MCP tests failed.' }

  & openclaw.cmd config validate
  if ($LASTEXITCODE -ne 0) { throw 'OpenClaw configuration validation failed.' }

  $probeText = (& openclaw.cmd mcp probe jixiangos-crm --json 2>$null) -join "`n"
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($probeText)) {
    throw 'OpenClaw MCP probe failed.'
  }
  $probe = $probeText | ConvertFrom-Json
  $actualTools = @(Collect-ToolNames -Node $probe | Sort-Object -Unique)
  $sortedExpectedTools = @(($expectedTools | Sort-Object))
  if (($actualTools -join ',') -ne ($sortedExpectedTools -join ',')) {
    throw "OpenClaw MCP probe must expose exactly: $($expectedTools -join ', ')."
  }

  Start-LocalProcessIfPortClosed -Port 3001 -FilePath 'npm.cmd' -Arguments @('run', 'dev:api') -Name 'QA API'
  Start-LocalProcessIfPortClosed -Port 3002 -FilePath 'npx.cmd' -Arguments @('vite', '--host', '127.0.0.1', '--port', '3002', '--strictPort') -Name 'QA web'

  Wait-HttpReady -Uri "$apiBase/api/health"
  Wait-HttpReady -Uri "$webBase/login"

  $headers = @{
    Authorization = "Bearer $automationToken"
    'X-JXOS-WECHAT-SENDER' = $senderId
    'X-JXOS-QA-DATABASE-PROOF' = $expectedDatabase
  }
  $probeBody = @{ customer = @{ name = 'Windows WeChat launcher probe' } } | ConvertTo-Json -Depth 4 -Compress
  $identityResponse = Invoke-WebRequest -Uri "$apiBase/api/automation/wechat/customers/check" `
    -Method Post -Headers $headers -ContentType 'application/json' -Body $probeBody -UseBasicParsing -TimeoutSec 10
  if ($identityResponse.Headers['X-JXOS-QA-DATABASE-PROOF'] -ne $expectedDatabase) {
    throw 'The running API did not prove the expected QA database identity.'
  }

  if (-not $SkipGateway) {
    Start-LocalProcessIfPortClosed -Port $gatewayPort -FilePath 'openclaw.cmd' `
      -Arguments @('gateway', 'run', '--port', [string]$gatewayPort, '--bind', 'loopback') -Name 'OpenClaw QA gateway'
    Wait-GatewayReady
  }

  Write-Output 'WeChat QA environment is ready.'
  Write-Output "API: $apiBase"
  Write-Output "Web: $webBase"
  if (-not $SkipGateway) { Write-Output "OpenClaw gateway: ws://127.0.0.1:$gatewayPort" }
  Write-Output "Database identity: $expectedDatabase"
  Write-Output "MCP tools: $($expectedTools -join ', ')"
} finally {
  Pop-Location
}
