export interface AttachmentSelectionOptions {
  maxCount: number;
  maxBytes: number;
  accept: string[];
  rejectWholeBatchOnOverflow: boolean;
}

export interface AttachmentSelectionResult {
  accepted: File[];
  rejected: File[];
  duplicates: File[];
  message?: string;
}

function fileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function matchesAcceptedType(file: File, accepted: string[]): boolean {
  return accepted.some((rule) => (
    rule.endsWith('/') ? file.type.startsWith(rule) : file.type === rule
  ));
}

function sizeLabel(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / 1024 / 1024)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

export function selectAttachments(
  current: File[],
  incoming: File[],
  options: AttachmentSelectionOptions,
): AttachmentSelectionResult {
  const seen = new Set(current.map(fileKey));
  const duplicates: File[] = [];
  const invalidType: File[] = [];
  const oversized: File[] = [];
  const eligible: File[] = [];

  incoming.forEach((file) => {
    const key = fileKey(file);
    if (seen.has(key)) {
      duplicates.push(file);
      return;
    }
    seen.add(key);
    if (!matchesAcceptedType(file, options.accept)) {
      invalidType.push(file);
      return;
    }
    if (file.size > options.maxBytes) {
      oversized.push(file);
      return;
    }
    eligible.push(file);
  });

  const remaining = Math.max(0, options.maxCount - current.length);
  if (options.rejectWholeBatchOnOverflow && eligible.length > remaining) {
    return {
      accepted: [],
      duplicates,
      rejected: [...invalidType, ...oversized, ...eligible],
      message: `最多上传 ${options.maxCount} 张，本次选择了 ${eligible.length} 张`,
    };
  }

  const accepted = eligible.slice(0, remaining);
  const overflow = eligible.slice(remaining);
  const messages = [
    invalidType.length ? `${invalidType.length} 个文件类型不支持` : '',
    oversized.length ? `${oversized.length} 个文件不能超过 ${sizeLabel(options.maxBytes)}` : '',
    overflow.length ? `最多上传 ${options.maxCount} 张，已加入 ${accepted.length} 张，另有 ${overflow.length} 张未加入` : '',
    duplicates.length ? `${duplicates.length} 个重复文件已忽略` : '',
  ].filter(Boolean);

  return {
    accepted,
    duplicates,
    rejected: [...invalidType, ...oversized, ...overflow],
    message: messages.join('；') || undefined,
  };
}

export function clipboardImageFiles(data: DataTransfer): File[] {
  return Array.from(data.items || [])
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));
}
