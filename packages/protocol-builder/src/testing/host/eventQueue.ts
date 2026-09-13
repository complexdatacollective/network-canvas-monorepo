/**
 * A one-consumer queue an event source pushes into and a generator drains.
 *
 * The pinned oRPC has no publisher helper, so `watchProtocol` needs its own
 * bridge from the store's synchronous publish to an async iterator.
 */
export class EventQueue<T> {
  #buffer: T[] = [];
  #wake: (() => void) | undefined;
  #closed = false;

  push(value: T): void {
    if (this.#closed) return;
    this.#buffer.push(value);
    this.#wake?.();
    this.#wake = undefined;
  }

  close(): void {
    this.#closed = true;
    this.#wake?.();
    this.#wake = undefined;
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<T> {
    while (true) {
      const next = this.#buffer.shift();
      if (next !== undefined) {
        yield next;
        continue;
      }
      if (this.#closed) return;
      await new Promise<void>((resolve) => {
        this.#wake = resolve;
      });
    }
  }
}
