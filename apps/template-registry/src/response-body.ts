import { RegistryError } from './problems.ts';

/** Hold bounded response capacity until the client consumes or cancels its bytes. */
export function retainResponseBody(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  release: () => void,
  timeoutMs = 60_000,
): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  let finished = false;
  let controller: ReadableStreamDefaultController<Uint8Array>;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
    release();
  };
  const cancelReader = () => {
    // A transport's cancel hook is untrusted and may never settle.
    void reader.cancel().catch(() => undefined);
  };
  const abort = () => {
    if (finished) return;
    finish();
    cancelReader();
    controller.error(new RegistryError('REQUEST_TIMEOUT'));
  };
  const timer = setTimeout(abort, timeoutMs);
  timer.unref();
  const stream = new ReadableStream<Uint8Array>(
    {
      start(value) {
        controller = value;
      },
      async pull(value) {
        try {
          const result = await reader.read();
          if (finished) return;
          if (result.done) {
            finish();
            reader.releaseLock();
            value.close();
          } else value.enqueue(result.value);
        } catch (error) {
          if (finished) return;
          finish();
          cancelReader();
          value.error(error);
        }
      },
      cancel() {
        finish();
        cancelReader();
      },
    },
    { highWaterMark: 0 },
  );
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  return stream;
}
