import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';

const leadsPage = readFileSync('src/pages/Leads/index.tsx', 'utf8');

assert.match(leadsPage, /下载浏览器员工/, '线索管理顶部必须提供浏览器员工下载入口');
assert.match(
  leadsPage,
  /PermissionGate permissionKey=\{PERMISSION_KEYS\.LEADS_CREATE\} action="write"[\s\S]*?handleDownloadBrowserEmployee/,
  '下载入口必须受新建线索写权限控制',
);
assert.match(leadsPage, /downloadBackendFile\('\/browser-agent\/download'/, '前端必须通过带OS会话的后端接口下载');

const archivePath = 'server/assets/browser-agent/jixiang-ai-browser-employee.zip';
assert.equal(existsSync(archivePath), true, '系统必须发布非公开目录中的插件安装包');
const temporaryDir = mkdtempSync(join(tmpdir(), 'jixiang-browser-package-'));
const freshArchivePath = join(temporaryDir, 'browser-employee.zip');
try {
  const build = spawnSync('npm', ['run', 'browser-employee:build'], { stdio: 'inherit' });
  assert.equal(build.status, 0, '校验安装包前必须从当前源码重新构建插件');
  const packageResult = spawnSync(process.execPath, ['scripts/package-browser-employee.mjs'], {
    stdio: 'inherit',
    env: { ...process.env, BROWSER_EMPLOYEE_PACKAGE_OUTPUT: freshArchivePath },
  });
  assert.equal(packageResult.status, 0, '打包脚本必须能独立生成安装包');

  const publishedZip = await JSZip.loadAsync(readFileSync(archivePath));
  const freshZip = await JSZip.loadAsync(readFileSync(freshArchivePath));
  const requiredFiles = ['manifest.json', 'background.js', 'content.js', 'sidepanel.html', 'sidepanel.js', 'sidepanel.css', 'INSTALL.txt'];
  for (const filename of requiredFiles) {
    assert.ok(publishedZip.file(filename), `插件安装包必须包含 ${filename}`);
    assert.ok(freshZip.file(filename), `打包脚本必须生成 ${filename}`);
    assert.deepEqual(
      await publishedZip.file(filename)!.async('nodebuffer'),
      await freshZip.file(filename)!.async('nodebuffer'),
      `已发布的 ${filename} 必须与当前源码新鲜构建一致`,
    );
  }
  assert.equal(Object.keys(publishedZip.files).some((filename) => filename.endsWith('.map')), false, '安装包不得包含 sourcemap');
  assert.equal(Object.keys(freshZip.files).some((filename) => filename.endsWith('.map')), false, '打包脚本不得包含 sourcemap');
} finally {
  rmSync(temporaryDir, { recursive: true, force: true });
}

console.log('lead browser employee download entry: ok');
