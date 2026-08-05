export async function readWithAbort<T>(
  reader: ReadableStreamDefaultReader<T>,
  signal: AbortSignal,
): Promise<ReadableStreamReadResult<T>> {
  if (signal.aborted) {
    void reader.cancel().catch(() => {});
    throw new DOMException("The operation was aborted", "AbortError");
  }

  const { promise, resolve, reject } = Promise.withResolvers<ReadableStreamReadResult<T>>();
  let settled = false;

  const cleanup = () => signal.removeEventListener("abort", handleAbort);
  const handleAbort = () => {
    if (settled) return;
    settled = true;
    cleanup();
    void reader.cancel().catch(() => {});
    reject(new DOMException("The operation was aborted", "AbortError"));
  };

  signal.addEventListener("abort", handleAbort, { once: true });
  reader.read().then(
    (result) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    },
    (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    },
  );
  return promise;
}
