import type { ProtocolBuilderResourceGateway } from '../../gateway.ts';

/**
 * The real in-memory host with the one or two methods a test is about
 * replaced, so a call can be held open, answered late, or answered twice.
 *
 * Every method is forwarded explicitly rather than spread from `inner`: the
 * gateway is a class instance, and its methods live on the prototype where a
 * spread would not find them.
 */
export function overrideGateway(
  inner: ProtocolBuilderResourceGateway,
  overrides: Partial<ProtocolBuilderResourceGateway>,
): ProtocolBuilderResourceGateway {
  return {
    secretStorage: inner.secretStorage,
    list: (options) => inner.list(options),
    stageUpload: (request) => inner.stageUpload(request),
    stageSecret: (request) => inner.stageSecret(request),
    resolvePreview: (resourceId) => inner.resolvePreview(resourceId),
    inspect: (resourceId) => inner.inspect(resourceId),
    download: (resourceId) => inner.download(resourceId),
    discardStaged: (resourceId) => inner.discardStaged(resourceId),
    discardAllStaged: () => inner.discardAllStaged(),
    promote: (request) => inner.promote(request),
    ...overrides,
  };
}

export type Deferred<T> = Readonly<{
  promise: Promise<T>;
  /** Answers the held call. */
  settle: (value: T) => void;
}>;

/** A call the test decides the timing and the answer of. */
export function deferred<T>(): Deferred<T> {
  let settle: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return { promise, settle: (value: T) => settle(value) };
}

/**
 * Runs the microtasks and the zero-delay timers a held call's own continuation
 * needs, inside `act`, so a state update it should NOT make has had every
 * chance to happen before the assertion that it did not.
 */
export async function flushPendingWork(): Promise<void> {
  await new Promise((settle) => setTimeout(settle, 0));
  await new Promise((settle) => setTimeout(settle, 0));
}
