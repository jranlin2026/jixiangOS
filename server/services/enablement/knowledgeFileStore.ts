import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const cleanSegment = (value: string) => path.basename(value)
  .replace(/[^\w.\-\u4e00-\u9fff]+/g, '_')
  .slice(0, 180);

export function createKnowledgeFileStore(root: string) {
  const resolvedRoot = path.resolve(root);
  const resolveKey = (key: string) => {
    const target = path.resolve(resolvedRoot, key);
    const relative = path.relative(resolvedRoot, target);
    if (!relative || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) {
      throw new Error('非法文件路径');
    }
    return target;
  };

  return {
    async writeMarkdown(input: { documentId: string; versionId: string; fileName: string; markdown: string }) {
      const storageKey = [
        cleanSegment(input.documentId),
        cleanSegment(input.versionId),
        cleanSegment(input.fileName || 'source.md'),
      ].join('/');
      const target = resolveKey(storageKey);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, input.markdown, 'utf8');
      return { storageKey, byteSize: Buffer.byteLength(input.markdown, 'utf8') };
    },
    async readMarkdown(storageKey: string) {
      return readFile(resolveKey(storageKey), 'utf8');
    },
  };
}
