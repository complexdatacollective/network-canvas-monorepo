import {
  type BackendOptions,
  fromBackend,
  type ObjectStore,
} from '../../storage/object-store.ts';

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
export function memoryObjectStore(
  options: BackendOptions = {},
): MemoryObjectStore {
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
    read: (key, _signal, range) =>
      reach(() => {
        const object = found(key);
        const bytes =
          range === undefined
            ? object.bytes
            : object.bytes.slice(range.start, range.end + 1);
        return {
          body: new Blob([bytes]).stream(),
          size: bytes.byteLength,
          mediaType: object.mediaType,
        };
      }),
    remove: (key) =>
      reach(() => {
        removed.push(key);
        return objects.delete(key);
      }),
    // Pages in key order, the cursor being the last key a page held.
    list: (prefix, cursor) =>
      reach(() => {
        const after = [...objects.entries()]
          .filter(
            ([key]) =>
              key.startsWith(prefix) && (cursor === undefined || key > cursor),
          )
          .toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
        const page = after.slice(0, options.listPageSize ?? after.length);
        const last = page.at(-1);
        return {
          objects: page.map(([key, object]) => ({
            key,
            lastModified: object.lastModified,
          })),
          next:
            last !== undefined && page.length < after.length
              ? last[0]
              : undefined,
        };
      }),
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
