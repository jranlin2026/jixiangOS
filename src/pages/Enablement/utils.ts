type UploadFile = Pick<File, 'name' | 'type'>;

const markdownMimeTypes = new Set(['', 'text/markdown', 'text/plain']);

export function isMarkdownFile(file: UploadFile): boolean {
  return /\.md$/i.test(file.name.trim()) && markdownMimeTypes.has(file.type.toLowerCase());
}
