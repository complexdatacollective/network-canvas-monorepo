type BodyResult =
  | { ok: true; text: string }
  | { ok: false; reason: 'too_large' | 'unreadable' };

/**
 * Reads a request body as UTF-8 text, stopping as soon as it passes
 * `maxBytes`. `Content-Length` is checked first only as a shortcut: a client
 * can omit it or lie, so the bytes are counted as they arrive.
 */
export const readBodyWithLimit = async (
  request: Request,
  maxBytes: number,
): Promise<BodyResult> => {
  const declared = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, reason: 'too_large' };
  }
  if (!request.body) return { ok: true, text: '' };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel();
        return { ok: false, reason: 'too_large' };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: 'unreadable' };
  }

  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return {
      ok: true,
      text: new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(
        bytes,
      ),
    };
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
};
