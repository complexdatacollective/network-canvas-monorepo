import { describe, expect, it, vi } from 'vitest';

import { type ImportPhase, importProtocolFromUrl } from '../importProtocol';

function streamingResponse(
  chunks: Uint8Array[],
  contentLength: number,
): Response {
  let i = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(chunks[i] as Uint8Array);
        i += 1;
      } else {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'content-length': String(contentLength) },
  });
}

describe('importProtocolFromUrl progress events', () => {
  it('emits fetching events with determinate progress, then extracting', async () => {
    const chunks = [new Uint8Array(40), new Uint8Array(60)];
    const total = 100;
    const fetchMock = vi
      .fn()
      .mockResolvedValue(streamingResponse(chunks, total));
    vi.stubGlobal('fetch', fetchMock);

    const phases: { phase: ImportPhase; progress?: number }[] = [];
    const result = await importProtocolFromUrl(
      'https://example.test/protocol.netcanvas',
      (event) => {
        phases.push({ phase: event.phase, progress: event.progress });
      },
    );

    vi.unstubAllGlobals();

    // Extraction fails (the body is zero bytes, not a valid zip), but progress events still fire.
    expect(result.success).toBe(false);
    const fetching = phases.filter((p) => p.phase === 'fetching');
    expect(fetching.length).toBe(2);
    expect(fetching[0]?.progress).toBeCloseTo(0.4);
    expect(fetching[1]?.progress).toBeCloseTo(1);
    expect(phases.some((p) => p.phase === 'extracting')).toBe(true);
  });
});
