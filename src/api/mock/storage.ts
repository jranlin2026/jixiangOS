/** localStorage 读写工具 */
import { STORAGE_KEYS, STORAGE_PREFIX } from '../../shared/utils/constants';
import {
  clearBackendStorageValues,
  persistBackendStorageValue,
  removeBackendStorageValue,
} from '../backendClient';

/** 初始化 localStorage，仅首次执行 */
export function initializeStorage<T>(key: string, data: T): void {
  const existing = localStorage.getItem(key);
  if (!existing) {
    localStorage.setItem(key, JSON.stringify(data));
    persistBackendStorageValue(key, data);
  }
}

/** 从 localStorage 获取数据 */
export function getStorageData<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** 更新 localStorage 数据 */
export function setStorageData<T>(key: string, data: T): void {
  localStorage.setItem(key, JSON.stringify(data));
  persistBackendStorageValue(key, data);
}

/** 删除 localStorage 数据 */
export function removeStorageData(key: string): void {
  localStorage.removeItem(key);
  removeBackendStorageValue(key);
}

/** 清除所有 aaos_ 前缀的数据 */
export function clearAllStorageData(): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(STORAGE_PREFIX)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => localStorage.removeItem(key));
  clearBackendStorageValues();
}

/** 检查是否已初始化 */
export function isStorageInitialized(): boolean {
  return localStorage.getItem(STORAGE_KEYS.INITIALIZED) === 'true';
}

/** 标记已初始化 */
export function markStorageInitialized(): void {
  localStorage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
  persistBackendStorageValue(STORAGE_KEYS.INITIALIZED, true);
}

/** 重置所有数据（用于开发调试） */
export function resetStorage(): void {
  clearAllStorageData();
  window.location.reload();
}
