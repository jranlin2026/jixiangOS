const INSTALLATION_CACHE_KEY = 'aaos_system_installation_id';
const SYSTEM_CACHE_PREFIX = 'aaos_';

export function synchronizeClientInstallation(installationId: string): void {
  if (typeof localStorage === 'undefined') return;
  const nextInstallationId = String(installationId || '').trim();
  if (!nextInstallationId || localStorage.getItem(INSTALLATION_CACHE_KEY) === nextInstallationId) return;

  const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index));
  keys.forEach((key) => {
    if (key?.startsWith(SYSTEM_CACHE_PREFIX)) localStorage.removeItem(key);
  });
  localStorage.setItem(INSTALLATION_CACHE_KEY, nextInstallationId);
}
