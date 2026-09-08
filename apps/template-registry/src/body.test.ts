import { describe, expect, it, vi } from 'vitest';

import { readBytesCapped } from './body.ts';

/** A stalled cancellation must fail the oracle instead of hanging this suite. */
async function withinDeadline<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error('Body read did not settle within 500ms')),
          500,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function source(chunks: Uint8Array[]) {
  let offset = 0;
  const cancel = vi.fn();
  const pull = vi.fn(
    (controller: ReadableStreamDefaultController<Uint8Array>) => {
      const chunk = chunks[offset++];
      if (chunk) controller.enqueue(chunk);
      else controller.close();
    },
  );
  const stream = new ReadableStream<Uint8Array>(
    { pull, cancel },
    { highWaterMark: 0 },
  );
  return { stream, pull, cancel };
}

describe('capped registry request bodies', () => {
  it('accepts an absent body', async () => {
    expect(await readBytesCapped(null, 3)).toEqual(new Uint8Array());
  });

  it('accepts exactly the cap across multiple chunks and releases the reader', async () => {
    const input = source([new Uint8Array([1, 2]), new Uint8Array([3])]);
    expect(await readBytesCapped(input.stream, 3)).toEqual(
      new Uint8Array([1, 2, 3]),
    );
    expect(input.cancel).not.toHaveBeenCalled();
    expect(input.stream.locked).toBe(false);
  });

  it('refuses the first byte over the cap and cancels before reading the remainder', async () => {
    const input = source([
      new Uint8Array([1, 2]),
      new Uint8Array([3, 4]),
      new Uint8Array([5]),
    ]);
    await expect(readBytesCapped(input.stream, 3)).rejects.toMatchObject({
      code: 'CONTENT_TOO_LARGE',
    });
    expect(input.pull).toHaveBeenCalledTimes(2);
    expect(input.cancel).toHaveBeenCalledTimes(1);
    expect(input.stream.locked).toBe(false);
  });

  it('does not await a stalled cancellation before rejecting an oversized body', async () => {
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(2));
      },
      cancel,
    });
    await expect(
      withinDeadline(readBytesCapped(stream, 1, AbortSignal.timeout(20))),
    ).rejects.toMatchObject({ code: 'CONTENT_TOO_LARGE' });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(stream.locked).toBe(false);
  });

  it('preserves zero and tiny chunks without changing their byte order', async () => {
    const expected = Uint8Array.from(
      { length: 4096 },
      (_, index) => index % 256,
    );
    let offset = 0;
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          if (offset === expected.length) {
            controller.close();
            return;
          }
          controller.enqueue(new Uint8Array());
          controller.enqueue(new Uint8Array([expected[offset++]!]));
        },
      },
      { highWaterMark: 0 },
    );
    expect(await readBytesCapped(stream, expected.length)).toEqual(expected);
    expect(stream.locked).toBe(false);
  });

  it('captures each consumed tiny chunk before its producer reuses the buffer', async () => {
    const shared = new Uint8Array(1);
    let offset = 0;
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          if (offset === 4) {
            controller.close();
            return;
          }
          shared[0] = ++offset;
          controller.enqueue(shared);
        },
      },
      { highWaterMark: 0 },
    );
    expect(await readBytesCapped(stream, 4)).toEqual(
      new Uint8Array([1, 2, 3, 4]),
    );
  });

  it('cancels a body when its original request signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const input = source([new Uint8Array([1])]);
    await expect(
      readBytesCapped(input.stream, 3, controller.signal),
    ).rejects.toMatchObject({ code: 'REQUEST_TIMEOUT' });
    expect(input.pull).not.toHaveBeenCalled();
    expect(input.cancel).toHaveBeenCalledTimes(1);
    expect(input.stream.locked).toBe(false);
  });

  it('honors the original request abort during a pending read without awaiting cancellation', async () => {
    const controller = new AbortController();
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const stream = new ReadableStream<Uint8Array>(
      { cancel },
      { highWaterMark: 0 },
    );
    const reading = readBytesCapped(stream, 3, controller.signal);
    controller.abort();
    await expect(withinDeadline(reading)).rejects.toMatchObject({
      code: 'REQUEST_TIMEOUT',
    });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(stream.locked).toBe(false);
  });

  it('honors a deadline for a body that never supplies a chunk', async () => {
    const input = source([]);
    const cancel = vi.fn();
    const stalled = new ReadableStream<Uint8Array>(
      { cancel },
      { highWaterMark: 0 },
    );
    await expect(
      withinDeadline(readBytesCapped(stalled, 3, AbortSignal.timeout(20))),
    ).rejects.toMatchObject({ code: 'REQUEST_TIMEOUT' });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(stalled.locked).toBe(false);
    expect(await readBytesCapped(input.stream, 3)).toEqual(new Uint8Array());
  });

  it('honors abort while the producer supplies empty chunks', async () => {
    const controller = new AbortController();
    const cancel = vi.fn();
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(reader) {
          pulls++;
          if (pulls === 5) controller.abort();
          else reader.enqueue(new Uint8Array());
        },
        cancel,
      },
      { highWaterMark: 0 },
    );
    await expect(
      withinDeadline(readBytesCapped(stream, 1, controller.signal)),
    ).rejects.toMatchObject({ code: 'REQUEST_TIMEOUT' });
    expect(pulls).toBe(5);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(stream.locked).toBe(false);
  });

  it('propagates reader failures and releases the stream', async () => {
    const failure = new Error('reader failure');
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(failure);
      },
    });
    await expect(readBytesCapped(stream, 3)).rejects.toBe(failure);
    expect(stream.locked).toBe(false);
  });
});
