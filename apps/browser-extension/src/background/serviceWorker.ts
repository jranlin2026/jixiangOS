import type {
  ApiEnvelope,
  AuthenticatedOperator,
  BrowserRuntimeConfig,
  BrowserRuntimeSelection,
  BrowserRuntimeShop,
  ExtensionConfig,
  LogoutResult,
  WorkerCommand,
} from '../shared/contracts';
import { normalizedApiBaseUrl } from '../shared/apiBaseUrl';
import { browserAgentConnectUrl } from '../shared/osSettingsUrl';

const CONFIG_KEY = 'jixiang_browser_employee_config';
const TOKEN_KEY = 'jixiang_browser_employee_token';
const OPERATOR_KEY = 'jixiang_browser_employee_operator';
const DEVICE_KEY = 'jixiang_browser_employee_device_id';

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);
chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }).catch(() => undefined);

async function stored<T>(area: chrome.storage.StorageArea, key: string): Promise<T | undefined> {
  return (await area.get(key))[key] as T | undefined;
}

async function clearSessionAuth() {
  await chrome.storage.local.remove([TOKEN_KEY, OPERATOR_KEY]);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<ApiEnvelope<T>> {
  const config = await stored<ExtensionConfig>(chrome.storage.local, CONFIG_KEY);
  if (!config?.apiBaseUrl) return { code: 400, data: null, message: '请先配置极享OS地址' };
  const token = await stored<string>(chrome.storage.local, TOKEN_KEY);
  const headers = new Headers(init.headers);
  if (init.body) headers.set('content-type', 'application/json');
  if (token) headers.set('authorization', `Bearer ${token}`);
  try {
    const response = await fetch(`${normalizedApiBaseUrl(config.apiBaseUrl)}${path}`, { ...init, headers });
    const payload = await response.json().catch(() => null) as ApiEnvelope<T> | null;
    if (response.status === 401) {
      await clearSessionAuth();
      return {
        code: 401,
        data: null,
        message: payload?.message || '登录状态已失效，请重新登录',
        authOutcome: 'SESSION_EXPIRED_LOCAL_LOGOUT',
      };
    }
    return payload || { code: response.status, data: null, message: `极享OS返回了HTTP ${response.status}` };
  } catch (error) {
    return { code: 503, data: null, message: error instanceof Error ? error.message : '无法连接极享OS' };
  }
}

function randomBase64Url(bytes = 32) {
  const value = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function sha256Base64Url(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function exchangeBrowserAgentCode(config: ExtensionConfig, input: Record<string, string>) {
  try {
    const response = await fetch(`${normalizedApiBaseUrl(config.apiBaseUrl)}/browser-agent/auth/exchange`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
    });
    return await response.json() as ApiEnvelope<{ token: string; user: AuthenticatedOperator }>;
  } catch (error) {
    return { code: 503, data: null, message: error instanceof Error ? error.message : '无法连接极享OS' };
  }
}

function normalizedBindingLookup(value: string) {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('zh-CN');
}

function selectedBindingId(config: ExtensionConfig, shops: BrowserRuntimeShop[]) {
  const storedId = config.shopBindingId?.trim();
  if (storedId) return shops.some((shop) => shop.id === storedId) ? storedId : undefined;
  const legacy = normalizedBindingLookup(config.shopKey || '');
  if (legacy) {
    const matches = shops.filter((shop) => [shop.displayName, shop.shopKey, ...shop.aliases]
      .some((candidate) => normalizedBindingLookup(candidate) === legacy));
    return matches.length === 1 ? matches[0].id : undefined;
  }
  return shops.length === 1 ? shops[0].id : undefined;
}

function storedConfig(apiBaseUrl: string, shopBindingId?: string): ExtensionConfig {
  return {
    apiBaseUrl: normalizedApiBaseUrl(apiBaseUrl),
    ...(shopBindingId?.trim() ? { shopBindingId: shopBindingId.trim() } : {}),
  };
}

chrome.runtime.onMessage.addListener((message: WorkerCommand, _sender, sendResponse) => {
  void (async () => {
    if (message.type === 'AUTH_STATE') {
      const [config, operator, token] = await Promise.all([
        stored<ExtensionConfig>(chrome.storage.local, CONFIG_KEY),
        stored<AuthenticatedOperator>(chrome.storage.local, OPERATOR_KEY),
        stored<string>(chrome.storage.local, TOKEN_KEY),
      ]);
      if (config && token && operator) {
        const result = await request<{ user: AuthenticatedOperator }>('/browser-agent/auth/session');
        if (result.code !== 0) {
          sendResponse({ ...result, data: { config } });
          return;
        }
      }
      sendResponse({ code: 0, data: { config, operator: token ? operator : undefined }, message: 'success' });
      return;
    }
    if (message.type === 'SAVE_CONFIG') {
      const config = storedConfig(message.config.apiBaseUrl, message.config.shopBindingId);
      await chrome.storage.local.set({ [CONFIG_KEY]: config });
      sendResponse({ code: 0, data: config, message: 'success' });
      return;
    }
    if (message.type === 'CONNECT_OS') {
      const config: ExtensionConfig = {
        ...storedConfig(message.config.apiBaseUrl, message.config.shopBindingId),
        ...(!message.config.shopBindingId && message.config.shopKey?.trim()
          ? { shopKey: message.config.shopKey }
          : {}),
      };
      await chrome.storage.local.set({ [CONFIG_KEY]: config });
      const deviceId = await stored<string>(chrome.storage.local, DEVICE_KEY) || crypto.randomUUID();
      await chrome.storage.local.set({ [DEVICE_KEY]: deviceId });
      const state = randomBase64Url(24);
      const verifier = randomBase64Url(48);
      const redirectUri = chrome.identity.getRedirectURL('browser-agent');
      let redirected: string | undefined;
      try {
        redirected = await chrome.identity.launchWebAuthFlow({
          url: browserAgentConnectUrl(config.apiBaseUrl, {
            state,
            code_challenge: await sha256Base64Url(verifier),
            redirect_uri: redirectUri,
            device_id: deviceId,
          }),
          interactive: message.interactive,
        });
      } catch (error) {
        sendResponse({
          code: 401,
          data: null,
          message: message.interactive && error instanceof Error ? error.message : '请连接已登录的极享OS',
          errorCode: 'BROWSER_AGENT_OS_LOGIN_REQUIRED',
        });
        return;
      }
      if (!redirected) {
        sendResponse({ code: 401, data: null, message: '未收到极享OS授权结果', errorCode: 'BROWSER_AGENT_OS_LOGIN_REQUIRED' });
        return;
      }
      const resultUrl = new URL(redirected);
      if (resultUrl.searchParams.get('state') !== state || !resultUrl.searchParams.get('code')) {
        sendResponse({ code: 401, data: null, message: '极享OS授权校验失败，请重试' });
        return;
      }
      const result = await exchangeBrowserAgentCode(config, {
        code: resultUrl.searchParams.get('code')!, verifier, redirectUri, deviceId,
      });
      if (result.code === 0 && result.data) {
        await chrome.storage.local.set({ [TOKEN_KEY]: result.data.token, [OPERATOR_KEY]: result.data.user });
        sendResponse({ code: 0, data: { operator: result.data.user, config }, message: 'success' });
        return;
      }
      sendResponse(result);
      return;
    }
    if (message.type === 'LOGOUT') {
      const result = await request<boolean>('/browser-agent/auth/logout', { method: 'POST' });
      if (result.code !== 0 && result.authOutcome !== 'SESSION_EXPIRED_LOCAL_LOGOUT') {
        sendResponse({ ...result, message: result.message || '浏览器员工会话撤销失败，请重试' });
        return;
      }
      await clearSessionAuth();
      sendResponse({
        code: 0,
        data: { sessionExpired: result.authOutcome === 'SESSION_EXPIRED_LOCAL_LOGOUT', localLogoutCompleted: true } satisfies LogoutResult,
        message: result.authOutcome === 'SESSION_EXPIRED_LOCAL_LOGOUT'
          ? '登录状态已失效，已完成本地退出'
          : '已退出浏览器员工，极享OS登录不受影响',
      });
      return;
    }
    if (message.type === 'GET_RUNTIME_CONFIG') {
      const result = await request<BrowserRuntimeConfig>('/browser-agent/runtime-config');
      if (result.code !== 0 || !result.data) {
        sendResponse(result);
        return;
      }
      const config = await stored<ExtensionConfig>(chrome.storage.local, CONFIG_KEY);
      if (!config?.apiBaseUrl) {
        sendResponse({ code: 400, data: null, message: '请先配置极享OS地址' });
        return;
      }
      const shopBindingId = selectedBindingId(config, result.data.shops);
      await chrome.storage.local.set({ [CONFIG_KEY]: storedConfig(config.apiBaseUrl, shopBindingId) });
      const data: BrowserRuntimeSelection = {
        ...result.data,
        ...(shopBindingId ? { selectedShopBindingId: shopBindingId } : {}),
      };
      sendResponse({ ...result, data });
      return;
    }
    if (message.type === 'PREVIEW_PRODUCT_MAPPING') {
      sendResponse(await request('/browser-agent/product-preview', {
        method: 'POST', body: JSON.stringify(message.input),
      }));
      return;
    }
    if (message.type === 'GET_SCRIPT_LIBRARY') {
      sendResponse(await request('/browser-agent/script-library'));
      return;
    }
    if (message.type === 'SAVE_SCRIPT_LIBRARY') {
      sendResponse(await request('/browser-agent/script-library', {
        method: 'PUT', body: JSON.stringify(message.library),
      }));
      return;
    }
    if (message.type === 'CREATE_LEAD_INTAKE') {
      sendResponse(await request('/browser-agent/lead-intakes', { method: 'POST', body: JSON.stringify(message.input) }));
      return;
    }
    if (message.type === 'REPORT_PLATFORM_COMPLETION') {
      sendResponse(await request(`/browser-agent/lead-intakes/${encodeURIComponent(message.syncId)}/platform-completion`, {
        method: 'POST',
        body: JSON.stringify({
          orderRemarkStatus: message.orderRemarkStatus,
          greenFlagStatus: message.greenFlagStatus,
          errorMessage: message.errorMessage,
        }),
      }));
      return;
    }
    if (message.type === 'REPORT_ORDER_REMARK') {
      sendResponse(await request(`/browser-agent/lead-intakes/${encodeURIComponent(message.syncId)}/order-remark`, {
        method: 'POST', body: JSON.stringify({ status: message.status, errorMessage: message.errorMessage }),
      }));
      return;
    }
    sendResponse({ code: 400, data: null, message: '插件后台版本过旧，请在扩展程序页面重新加载插件' });
  })().catch((error) => sendResponse({ code: 500, data: null, message: error instanceof Error ? error.message : '执行失败' }));
  return true;
});
