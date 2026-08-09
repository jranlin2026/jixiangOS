export function scriptLibrarySettingsUrl(apiBaseUrl: string) {
  const url = new URL(apiBaseUrl);
  const isLocal = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
  if (isLocal && url.port === '3012') url.port = '3002';
  if (isLocal && url.port === '3001') url.port = '3002';
  url.pathname = '/settings';
  url.search = '?group=aiEmployee&tab=scriptLibrary';
  url.hash = '';
  return url.toString();
}
