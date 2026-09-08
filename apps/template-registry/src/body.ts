import { setImmediate } from 'node:timers/promises';

import { RegistryError } from './problems.ts';

/** Enforce the limit during consumption, including for a chunked body. */
export async function readBytesCapped(
  body: ReadableStream<Uint8Array> | null,
  maximum: number,
  signal?: AbortSignal,
): Promise<Uint8Array<ArrayBuffer>> {
  if (!body) return new Uint8Array();
  const reader = body.getReader();
  // Coalesce immediately into bounded pages. Retaining incoming fragments can
  // exceed the byte budget through millions of tiny allocations, and a producer
  // may reuse its buffer after its chunk has been consumed.
  const pages: Uint8Array[] = [];
  const pageSize = 64 * 1024;
  let length = 0;
  let fragments = 0;
  let aborted = signal?.aborted ?? false;
  const abort = () => {
    aborted = true;
    void reader.cancel().catch(() => undefined);
  };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    if (aborted) {
      abort();
      throw new RegistryError('REQUEST_TIMEOUT');
    }
    for (;;) {
      const { done, value } = await reader.read();
      if (aborted) throw new RegistryError('REQUEST_TIMEOUT');
      if (done) break;
      if (value.byteLength > maximum - length) {
        void reader.cancel().catch(() => undefined);
        throw new RegistryError('CONTENT_TOO_LARGE');
      }
      let offset = 0;
      while (offset < value.byteLength) {
        const pageIndex = Math.floor(length / pageSize);
        const pageOffset = length % pageSize;
        const page =
          pages[pageIndex] ??
          new Uint8Array(Math.min(pageSize, maximum - length));
        pages[pageIndex] = page;
        const copied = Math.min(
          page.byteLength - pageOffset,
          value.byteLength - offset,
        );
        page.set(value.subarray(offset, offset + copied), pageOffset);
        offset += copied;
        length += copied;
      }
      // A continuously ready stream of empty/tiny chunks must not starve the
      // request deadline's timer by keeping execution in the microtask queue.
      if (++fragments % 1024 === 0) await setImmediate();
    }
  } finally {
    signal?.removeEventListener('abort', abort);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const page of pages) {
    const used = Math.min(page.byteLength, length - offset);
    bytes.set(page.subarray(0, used), offset);
    offset += used;
  }
  return bytes;
}
