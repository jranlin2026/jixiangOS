import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';

const projectRoot = process.cwd();
const extensionRoot = path.join(projectRoot, 'apps/browser-extension/dist');
const outputFile = process.env.BROWSER_EMPLOYEE_PACKAGE_OUTPUT
  ? path.resolve(process.env.BROWSER_EMPLOYEE_PACKAGE_OUTPUT)
  : path.join(projectRoot, 'server/assets/browser-agent/jixiang-ai-browser-employee.zip');
const outputDir = path.dirname(outputFile);

async function addDirectory(zip, directory, prefix = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.endsWith('.map')) continue;
    const absolutePath = path.join(directory, entry.name);
    const archivePath = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) await addDirectory(zip, absolutePath, archivePath);
    else zip.file(archivePath, await readFile(absolutePath));
  }
}

const manifest = JSON.parse(await readFile(path.join(extensionRoot, 'manifest.json'), 'utf8'));
const zip = new JSZip();
await addDirectory(zip, extensionRoot);
zip.file('INSTALL.txt', [
  `极享AI浏览器员工 V${manifest.version}`,
  '',
  '安装步骤：',
  '1. 将本压缩包完整解压到一个固定文件夹。',
  '2. Chrome地址栏打开 chrome://extensions。',
  '3. 打开右上角“开发者模式”。',
  '4. 点击“加载已解压的扩展程序”，选择刚才解压的文件夹。',
  '5. 先登录极享OS，再打开插件并确认连接。',
  '',
  '使用账号必须拥有“线索-线索列表-新建线索”权限。',
].join('\n'));

await mkdir(outputDir, { recursive: true });
await writeFile(outputFile, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } }));
console.log(`Browser employee package created: ${path.relative(projectRoot, outputFile)}`);
