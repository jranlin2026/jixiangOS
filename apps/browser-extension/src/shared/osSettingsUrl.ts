function osWebUrl(apiBaseUrl: string) {
  const url = new URL(apiBaseUrl);
  const isLocal = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
  if (isLocal && url.port === '3012') url.port = '3002';
  if (isLocal && url.port === '3001') url.port = '3002';
  return url;
}

export function scriptLibrarySettingsUrl(apiBaseUrl: string) {
  const url = osWebUrl(apiBaseUrl);
  url.pathname = '/settings';
  url.search = '?group=aiEmployee&tab=scriptLibrary';
  url.hash = '';
  return url.toString();
}

export function browserAgentConnectUrl(apiBaseUrl: string, params: Record<string, string>) {
  const url = osWebUrl(apiBaseUrl);
  url.pathname = '/browser-agent/connect';
  url.search = new URLSearchParams(params).toString();
  url.hash = '';
  return url.toString();
}
