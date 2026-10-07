import { fromBackend, type ObjectStore } from '../../storage/object-store.ts';

class MissingObject extends Error {}

type MemoryObject = {
  bytes: Uint8Array<ArrayBuffer>;
  mediaType: string;
  lastModified: Date;
};

export type MemoryObjectStore = {
  readonly store: ObjectStore['Service'];
  /** The keys stored now, assets and staged objects alike. */
  readonly keys: () => ReadonlyArray<string>;
  /** Every key a delete was asked for, in order. */
  readonly removed: () => ReadonlyArray<string>;
  /** Makes every call fail as an unreachable store's would. */
  readonly setUnreachable: (down: boolean) => void;
  /** Moves the objects under `prefix` back in time, as if written earlier. */
  readonly backdate: (prefix: string, byMs: number) => void;
};

/**
 * An object store held in memory, built through the port's own `fromBackend`
 * so it keeps every rule the real providers do. It has no server-side copy,
 * so promotion reads and writes, as on Azure.
 */
export function memoryObjectStore(): MemoryObjectStore {
  const objects = new Map<string, MemoryObject>();
  const removed: string[] = [];
  let unreachable = false;

  const reach = async <A>(answer: () => A): Promise<A> => {
    if (unreachable) throw new Error('the object store is unreachable');
    return answer();
  };
  const found = (key: string): MemoryObject => {
    const object = objects.get(key);
    if (object === undefined) throw new MissingObject(key);
    return object;
  };

  const store = fromBackend({
    stat: (key) =>
      reach(() => {
        const object = found(key);
        return { size: object.bytes.byteLength, mediaType: object.mediaType };
      }),
    write: (key, bytes, mediaType) =>
      reach(() =>
        objects.set(key, {
          bytes: new Uint8Array(bytes),
          mediaType,
          lastModified: new Date(),
        }),
      ),
    read: (key) =>
      reach(() => {
        const object = found(key);
        return {
          body: new Blob([object.bytes]).stream(),
          size: object.bytes.byteLength,
          mediaType: object.mediaType,
        };
      }),
    remove: (key) =>
      reach(() => {
        removed.push(key);
        return objects.delete(key);
      }),
    list: (prefix) =>
      reach(() =>
        [...objects.entries()]
          .filter(([key]) => key.startsWith(prefix))
          .map(([key, object]) => ({
            key,
            lastModified: object.lastModified,
          })),
      ),
    probe: () => reach(() => undefined),
    isNotFound: (error) => error instanceof MissingObject,
  });

  return {
    store,
    keys: () => [...objects.keys()],
    removed: () => [...removed],
    setUnreachable: (down) => {
      unreachable = down;
    },
    backdate: (prefix, byMs) => {
      for (const [key, object] of objects) {
        if (key.startsWith(prefix)) {
          object.lastModified = new Date(object.lastModified.getTime() - byMs);
        }
      }
    },
  };
}
