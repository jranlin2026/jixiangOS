import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const launcherPath = fileURLToPath(new URL('./start-wechat-qa.ps1', import.meta.url));
const launcher = readFileSync(launcherPath, 'utf8');

for (const required of [
  "'jixiang_os_wechat_qa'",
  "'127.0.0.1'",
  "'wechat-automation-qa'",
  "'jxos_customer_check'",
  "'jxos_customer_create'",
  "'X-JXOS-QA-DATABASE-PROOF'",
  "npm.cmd run mcp:openclaw:test",
  "openclaw.cmd config validate",
  "openclaw.cmd mcp probe jixiangos-crm --json",
]) {
  assert.match(launcher, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}

assert.match(launcher, /MinimumLength 32/);
assert.match(launcher, /automation token and signing key must be different/i);
assert.match(launcher, /QA_DATABASE_NAME must be exactly/);
assert.match(launcher, /DATABASE_URL must point exactly/);
assert.match(launcher, /running API did not prove the expected QA database identity/i);
assert.match(launcher, /probe must expose exactly/i);

assert.doesNotMatch(launcher, /Remove-Item|Stop-Process|taskkill|\.env\b|Set-Content|Out-File/);
assert.doesNotMatch(launcher, /Write-(?:Output|Host).*automationToken|Write-(?:Output|Host).*signingKey/i);
assert.doesNotMatch(launcher, /--force|gateway\s+restart|gateway\s+stop/);

console.log('WeChat QA launcher safety test passed');
