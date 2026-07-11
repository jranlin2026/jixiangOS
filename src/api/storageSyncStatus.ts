export type StorageSyncFailure = {
  key: string;
  operation: 'save' | 'delete' | 'clear';
  message: string;
};

let currentFailure: StorageSyncFailure | null = null;
const listeners = new Set<(failure: StorageSyncFailure | null) => void>();

function emit(): void {
  listeners.forEach((listener) => listener(currentFailure));
}

export function reportStorageSyncFailure(failure: StorageSyncFailure): void {
  currentFailure = failure;
  emit();
}

export function clearStorageSyncFailure(): void {
  currentFailure = null;
  emit();
}

export function subscribeStorageSyncFailures(
  listener: (failure: StorageSyncFailure | null) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
