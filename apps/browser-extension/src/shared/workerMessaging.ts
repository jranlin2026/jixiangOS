export function withWorkerTimeout<T>(request: Promise<T>, timeoutMs = 8_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = globalThis.setTimeout(() => {
      reject(new Error('插件后台响应超时，请在扩展程序页面重新加载插件'));
    }, timeoutMs);
    request.then(
      (value) => { globalThis.clearTimeout(timeout); resolve(value); },
      (error) => { globalThis.clearTimeout(timeout); reject(error); },
    );
  });
}
