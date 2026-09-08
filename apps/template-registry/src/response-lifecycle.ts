import type { Http2Bindings, HttpBindings } from '@hono/node-server';

export type RegistryResponse =
  | HttpBindings['outgoing']
  | Http2Bindings['outgoing'];

/** Release capacity only after the handler and its actual transport finish. */
export function retainResponseTransport(
  outgoing: RegistryResponse,
  release: () => void,
  timeoutMs = 60_000,
): () => void {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1)
    throw new Error('REGISTRY_RESPONSE_DEADLINE_INVALID');
  let handlerComplete = false;
  let responseComplete = false;
  let released = false;
  const finish = () => {
    if (released || !handlerComplete || !responseComplete) return;
    released = true;
    outgoing.off('finish', responseFinished);
    outgoing.off('close', responseFinished);
    release();
  };
  const responseFinished = () => {
    responseComplete = true;
    clearTimeout(timer);
    finish();
  };
  // A slow reader must not keep a fully buffered response alive indefinitely.
  // Destroying the actual response also cancels the adapter's active reader.
  const timer = setTimeout(() => outgoing.destroy(), timeoutMs);
  timer.unref();
  outgoing.once('finish', responseFinished);
  outgoing.once('close', responseFinished);
  if (outgoing.writableFinished || outgoing.destroyed) responseFinished();
  return () => {
    // If a client disconnected during a private-store fetch, retain the slot
    // until that handler releases its memory as well. Its I/O has its own bound.
    handlerComplete = true;
    finish();
  };
}
