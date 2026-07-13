export function withTimeout<T>(request: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([request, timeoutPromise]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}
