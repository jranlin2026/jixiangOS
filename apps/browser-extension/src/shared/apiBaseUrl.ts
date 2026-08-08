export function normalizedApiBaseUrl(value: string) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('极享OS地址必须使用HTTP或HTTPS');
  const isLoopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (url.protocol === 'http:' && !isLoopback) throw new Error('非本机极享OS地址必须使用HTTPS');
  return url.toString().replace(/\/$/, '');
}
