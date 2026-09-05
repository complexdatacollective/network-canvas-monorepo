import type pg from 'pg';

export type ProbeResult<T> =
  | { status: 'ok'; value: T }
  | { status: 'failed' | 'timeout' | 'unconfigured' };

/**
 * A deadline bounds the response, while single-flight bounds unfinished work.
 * A timed-out checkout remains the only checkout until pg actually settles it;
 * Promise.race followed by an immediate reset would leak one waiter per probe.
 */
export class BoundedProbe<T> {
  private active: Promise<ProbeResult<T>> | undefined;
  private cached: { until: number; result: ProbeResult<T> } | undefined;
  private controller: AbortController | undefined;
  private stopped = false;

  private readonly run: ((signal: AbortSignal) => Promise<T>) | undefined;
  private readonly timeoutMs: number;
  private readonly cacheMs: number;

  constructor(
    run: ((signal: AbortSignal) => Promise<T>) | undefined,
    timeoutMs = 2000,
    cacheMs = 1000,
  ) {
    if (
      !Number.isFinite(timeoutMs) ||
      timeoutMs <= 0 ||
      !Number.isFinite(cacheMs) ||
      cacheMs < 0
    )
      throw new RangeError(
        'probe bounds must be finite and non-negative, with a positive timeout',
      );
    this.run = run;
    this.timeoutMs = timeoutMs;
    this.cacheMs = cacheMs;
  }

  check(): Promise<ProbeResult<T>> {
    if (this.stopped) return Promise.resolve({ status: 'failed' });
    if (!this.run) return Promise.resolve({ status: 'unconfigured' });
    if (this.active) return this.active;
    if (this.cached && this.cached.until > Date.now())
      return Promise.resolve(this.cached.result);
    const controller = new AbortController();
    this.controller = controller;
    let timer: NodeJS.Timeout;
    const operation = Promise.resolve().then(() =>
      this.run!(controller.signal),
    );
    const result = new Promise<ProbeResult<T>>((resolve) => {
      controller.signal.addEventListener(
        'abort',
        () => resolve({ status: this.stopped ? 'failed' : 'timeout' }),
        { once: true },
      );
      timer = setTimeout(() => controller.abort(), this.timeoutMs);
      void operation.then(
        (value) =>
          resolve(
            controller.signal.aborted
              ? { status: 'timeout' }
              : { status: 'ok', value },
          ),
        () =>
          resolve(
            controller.signal.aborted
              ? { status: 'timeout' }
              : { status: 'failed' },
          ),
      );
    });
    this.active = result;
    void result.then((value) => {
      clearTimeout(timer);
      this.cached = { until: Date.now() + this.cacheMs, result: value };
      return undefined;
    });
    // Observe both outcomes without manufacturing an unhandled rejection.
    const settled = () => {
      if (this.active === result) this.active = undefined;
      if (this.controller === controller) this.controller = undefined;
    };
    void operation.then(settled, settled);
    return result;
  }

  stop(): void {
    this.stopped = true;
    this.controller?.abort();
  }
}

/** Abandon late checkouts and destroy interrupted queries, releasing the slot. */
export async function withProbeClient<T>(
  pool: pg.Pool,
  signal: AbortSignal,
  run: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let released = false;
  const release = (destroy = false) => {
    if (released) return;
    released = true;
    client.release(destroy);
  };
  const abort = () => release(true);
  try {
    signal.throwIfAborted();
    signal.addEventListener('abort', abort, { once: true });
    return await run(client);
  } finally {
    signal.removeEventListener('abort', abort);
    release();
  }
}
