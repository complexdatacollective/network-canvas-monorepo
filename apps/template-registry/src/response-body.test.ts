import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { retainArtifactResponse } from './response-body.ts';

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
  return {
    stream: new ReadableStream<Uint8Array>(
      { pull, cancel },
      { highWaterMark: 0 },
    ),
    pull,
    cancel,
  };
}

describe('artifact response capacity lifetime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('retains the slot without a consumer until cancellation or the default deadline', async () => {
    const input = source([new Uint8Array([1, 2, 3])]);
    const release = vi.fn();
    const output = retainArtifactResponse(
      input.stream,
      new AbortController().signal,
      release,
    );
    await vi.advanceTimersByTimeAsync(59_999);
    expect(input.pull).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
    await output.cancel();
    expect(release).toHaveBeenCalledTimes(1);
    expect(input.cancel).toHaveBeenCalledTimes(1);
  });

  it('preserves all bytes and releases exactly once after complete drainage', async () => {
    const input = source([new Uint8Array([1, 2]), new Uint8Array([3])]);
    const controller = new AbortController();
    const release = vi.fn();
    const reader = retainArtifactResponse(
      input.stream,
      controller.signal,
      release,
      50,
    ).getReader();
    expect(await reader.read()).toEqual({
      done: false,
      value: new Uint8Array([1, 2]),
    });
    expect(release).not.toHaveBeenCalled();
    expect(await reader.read()).toEqual({
      done: false,
      value: new Uint8Array([3]),
    });
    expect(release).not.toHaveBeenCalled();
    expect(await reader.read()).toEqual({ done: true, value: undefined });
    expect(release).toHaveBeenCalledTimes(1);
    expect(input.cancel).not.toHaveBeenCalled();
    controller.abort();
    await vi.advanceTimersByTimeAsync(100);
    await reader.cancel();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('releases exactly once when the consumer cancels a partially read body', async () => {
    const input = source([new Uint8Array([1]), new Uint8Array([2])]);
    const controller = new AbortController();
    const release = vi.fn();
    const reader = retainArtifactResponse(
      input.stream,
      controller.signal,
      release,
      50,
    ).getReader();
    expect(await reader.read()).toEqual({
      done: false,
      value: new Uint8Array([1]),
    });
    expect(release).not.toHaveBeenCalled();
    await reader.cancel();
    expect(input.pull).toHaveBeenCalledTimes(1);
    expect(input.cancel).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
    controller.abort();
    await vi.advanceTimersByTimeAsync(100);
    await reader.cancel();
    expect(release).toHaveBeenCalledTimes(1);
    expect(input.cancel).toHaveBeenCalledTimes(1);
  });

  it('releases on an underlying read error and propagates that failure', async () => {
    const failure = new Error('response reader failure');
    const controller = new AbortController();
    const release = vi.fn();
    const input = new ReadableStream<Uint8Array>(
      {
        pull(reader) {
          reader.error(failure);
        },
      },
      { highWaterMark: 0 },
    );
    const reader = retainArtifactResponse(
      input,
      controller.signal,
      release,
      50,
    ).getReader();
    await expect(reader.read()).rejects.toBe(failure);
    expect(release).toHaveBeenCalledTimes(1);
    controller.abort();
    await vi.advanceTimersByTimeAsync(100);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('unblocks a pending read and releases once when the original request aborts', async () => {
    const cancel = vi.fn();
    const input = new ReadableStream<Uint8Array>(
      { cancel },
      { highWaterMark: 0 },
    );
    const controller = new AbortController();
    const release = vi.fn();
    const reader = retainArtifactResponse(
      input,
      controller.signal,
      release,
      50,
    ).getReader();
    const rejection = expect(reader.read()).rejects.toMatchObject({
      code: 'REQUEST_TIMEOUT',
    });
    expect(release).not.toHaveBeenCalled();
    controller.abort();
    await rejection;
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('releases a never-consumed response at the deadline and refuses later reads', async () => {
    const input = source([new Uint8Array([1])]);
    const controller = new AbortController();
    const release = vi.fn();
    const output = retainArtifactResponse(
      input.stream,
      controller.signal,
      release,
      50,
    );
    await vi.advanceTimersByTimeAsync(49);
    expect(release).not.toHaveBeenCalled();
    expect(input.pull).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(release).toHaveBeenCalledTimes(1);
    expect(input.cancel).toHaveBeenCalledTimes(1);
    await expect(output.getReader().read()).rejects.toMatchObject({
      code: 'REQUEST_TIMEOUT',
    });
    controller.abort();
    await vi.advanceTimersByTimeAsync(100);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('unblocks a stalled response read at the deadline', async () => {
    const cancel = vi.fn();
    const input = new ReadableStream<Uint8Array>(
      { cancel },
      { highWaterMark: 0 },
    );
    const release = vi.fn();
    const reader = retainArtifactResponse(
      input,
      new AbortController().signal,
      release,
      50,
    ).getReader();
    const rejection = expect(reader.read()).rejects.toMatchObject({
      code: 'REQUEST_TIMEOUT',
    });
    await vi.advanceTimersByTimeAsync(49);
    expect(release).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await rejection;
    expect(release).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('keeps independent lifetimes when an AbortSignal is reused', async () => {
    const controller = new AbortController();
    const first = source([new Uint8Array([1])]);
    const firstRelease = vi.fn();
    const firstOutput = retainArtifactResponse(
      first.stream,
      controller.signal,
      firstRelease,
      50,
    );
    expect(
      new Uint8Array(await new Response(firstOutput).arrayBuffer()),
    ).toEqual(new Uint8Array([1]));
    expect(firstRelease).toHaveBeenCalledTimes(1);
    const second = source([new Uint8Array([2])]);
    const secondRelease = vi.fn();
    const secondOutput = retainArtifactResponse(
      second.stream,
      controller.signal,
      secondRelease,
      50,
    );
    expect(secondRelease).not.toHaveBeenCalled();
    controller.abort();
    await expect(secondOutput.getReader().read()).rejects.toMatchObject({
      code: 'REQUEST_TIMEOUT',
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(firstRelease).toHaveBeenCalledTimes(1);
    expect(secondRelease).toHaveBeenCalledTimes(1);
    expect(first.cancel).not.toHaveBeenCalled();
    expect(second.cancel).toHaveBeenCalledTimes(1);
  });

  it('releases immediately when a reused signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const input = source([new Uint8Array([1])]);
    const release = vi.fn();
    const output = retainArtifactResponse(
      input.stream,
      controller.signal,
      release,
      50,
    );
    await expect(output.getReader().read()).rejects.toMatchObject({
      code: 'REQUEST_TIMEOUT',
    });
    expect(input.pull).not.toHaveBeenCalled();
    expect(input.cancel).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('does not wait for a stalled underlying cancel before releasing or settling consumer cancellation', async () => {
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const input = new ReadableStream<Uint8Array>(
      { cancel },
      { highWaterMark: 0 },
    );
    const release = vi.fn();
    const controller = new AbortController();
    const output = retainArtifactResponse(
      input,
      controller.signal,
      release,
      50,
    );
    let outcome = 'pending';
    const cancellation = output.cancel().then(
      () => {
        outcome = 'resolved';
        return outcome;
      },
      () => {
        outcome = 'rejected';
        return outcome;
      },
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(outcome).toBe('resolved');
    expect(release).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
    await cancellation;
    controller.abort();
    await vi.advanceTimersByTimeAsync(100);
    expect(release).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('releases on deadline even when the underlying cancellation never settles', async () => {
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const input = new ReadableStream<Uint8Array>(
      { cancel },
      { highWaterMark: 0 },
    );
    const release = vi.fn();
    const output = retainArtifactResponse(
      input,
      new AbortController().signal,
      release,
      50,
    );
    await vi.advanceTimersByTimeAsync(50);
    expect(release).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
    await expect(output.getReader().read()).rejects.toMatchObject({
      code: 'REQUEST_TIMEOUT',
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(release).toHaveBeenCalledTimes(1);
  });
});
