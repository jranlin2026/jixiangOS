import type { ApiEnvelope, AuthenticatedOperator, ExtensionConfig, WorkerCommand } from '../shared/contracts';

const CONFIG_KEY = 'jixiang_browser_employee_config';
const TOKEN_KEY = 'jixiang_browser_employee_token';
const OPERATOR_KEY = 'jixiang_browser_employee_operator';

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);

function normalizedBaseUrl(value: string) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('极享OS地址必须使用HTTP或HTTPS');
  return url.toString().replace(/\/$/, '');
}

async function stored<T>(area: chrome.storage.StorageArea, key: string): Promise<T | undefined> {
  return (await area.get(key))[key] as T | undefined;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<ApiEnvelope<T>> {
  const config = await stored<ExtensionConfig>(chrome.storage.local, CONFIG_KEY);
  if (!config?.apiBaseUrl) return { code: 400, data: null, message: '请先配置极享OS地址' };
  const token = await stored<string>(chrome.storage.session, TOKEN_KEY);
  const headers = new Headers(init.headers);
  if (init.body) headers.set('content-type', 'application/json');
  if (token) headers.set('authorization', `Bearer ${token}`);
  try {
    const response = await fetch(`${normalizedBaseUrl(config.apiBaseUrl)}${path}`, { ...init, headers });
    const payload = await response.json().catch(() => null) as ApiEnvelope<T> | null;
    if (response.status === 401) await chrome.storage.session.remove([TOKEN_KEY, OPERATOR_KEY]);
    return payload || { code: response.status, data: null, message: `极享OS返回了HTTP ${response.status}` };
  } catch (error) {
    return { code: 503, data: null, message: error instanceof Error ? error.message : '无法连接极享OS' };
  }
}

chrome.runtime.onMessage.addListener((message: WorkerCommand, _sender, sendResponse) => {
  void (async () => {
    if (message.type === 'AUTH_STATE') {
      const [config, operator, token] = await Promise.all([
        stored<ExtensionConfig>(chrome.storage.local, CONFIG_KEY),
        stored<AuthenticatedOperator>(chrome.storage.session, OPERATOR_KEY),
        stored<string>(chrome.storage.session, TOKEN_KEY),
      ]);
      sendResponse({ code: 0, data: { config, operator: token ? operator : undefined }, message: 'success' });
      return;
    }
    if (message.type === 'SAVE_CONFIG') {
      const config = { ...message.config, apiBaseUrl: normalizedBaseUrl(message.config.apiBaseUrl) };
      await chrome.storage.local.set({ [CONFIG_KEY]: config });
      sendResponse({ code: 0, data: config, message: 'success' });
      return;
    }
    if (message.type === 'LOGIN') {
      const config = { ...message.config, apiBaseUrl: normalizedBaseUrl(message.config.apiBaseUrl) };
      await chrome.storage.local.set({ [CONFIG_KEY]: config });
      const result = await request<{ token: string; user: AuthenticatedOperator }>('/auth/login', {
        method: 'POST', body: JSON.stringify({ account: message.account, password: message.password, remember: false }),
      });
      if (result.code === 0 && result.data) {
        await chrome.storage.session.set({ [TOKEN_KEY]: result.data.token, [OPERATOR_KEY]: result.data.user });
        sendResponse({ code: 0, data: { operator: result.data.user, config }, message: 'success' });
        return;
      }
      sendResponse(result);
      return;
    }
    if (message.type === 'LOGOUT') {
      await request('/auth/logout', { method: 'POST' });
      await chrome.storage.session.remove([TOKEN_KEY, OPERATOR_KEY]);
      sendResponse({ code: 0, data: true, message: 'success' });
      return;
    }
    if (message.type === 'CREATE_LEAD_INTAKE') {
      sendResponse(await request('/browser-agent/lead-intakes', { method: 'POST', body: JSON.stringify(message.input) }));
      return;
    }
    if (message.type === 'REPORT_ORDER_REMARK') {
      sendResponse(await request(`/browser-agent/lead-intakes/${encodeURIComponent(message.syncId)}/order-remark`, {
        method: 'POST', body: JSON.stringify({ status: message.status, errorMessage: message.errorMessage }),
      }));
    }
  })().catch((error) => sendResponse({ code: 500, data: null, message: error instanceof Error ? error.message : '执行失败' }));
  return true;
});
