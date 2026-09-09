// Protocol resources for the host contract: the asset manifest's entries and
// their bytes.
//
// Studio has an object store and a manifest section but no staged-resource
// storage — nothing today imports a file that is only kept if the edit around
// it is saved. So staging is held in this process, for the life of the edit,
// and only promotion touches storage: the bytes go to the object store and
// their manifest entries land in the `assets` section as one revision. A
// discarded stage leaves nothing behind, which is the property that made
// staging worth having.
import { z } from 'zod';

import {
  type ResourceDescriptorSchema,
  type ResourceGatewayFailureSchema,
  type ResourceInspectionSchema,
  type ResourcePreviewSchema,
  type ResourceSecretStorageSchema,
  type StageResourceInputSchema,
} from '@codaco/protocol-builder/contract/schemas';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import type { AssetStore } from '../assets.ts';

type Descriptor = z.output<typeof ResourceDescriptorSchema>;
type Failure = z.output<typeof ResourceGatewayFailureSchema>;
type Inspection = z.output<typeof ResourceInspectionSchema>;
type Preview = z.output<typeof ResourcePreviewSchema>;
type SecretStorage = z.output<typeof ResourceSecretStorageSchema>;
type StageRequest = z.output<typeof StageResourceInputSchema>['request'];

export type ResourceOutcome<TData> =
  | { status: 'ok'; data: TData }
  | { status: 'failed'; failure: Failure };

/** Manifest entries a promotion writes, and the bytes it must store first. */
export type PromotionPlan = {
  entries: Record<string, unknown>;
  promoted: Descriptor[];
};

type StagedEntry = {
  descriptor: Descriptor;
  handle?: string;
  bytes?: Blob;
  secret?: string;
};

const SHA256_HEX = /^[0-9a-f]{64}$/;

const KindSchema = z.enum([
  'audio',
  'geojson',
  'image',
  'network',
  'video',
  'apikey',
]);

function failure(
  reason: Failure['reason'],
  message: string,
  resourceId?: string,
): ResourceOutcome<never> {
  return {
    status: 'failed',
    failure: {
      reason,
      message,
      retryable: reason === 'unavailable' || reason === 'promotion-failed',
      ...(resourceId === undefined ? {} : { resourceId }),
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function base64(blob: Blob): Promise<string> {
  return Buffer.from(await blob.arrayBuffer()).toString('base64');
}

/**
 * The stored name for promoted bytes: the content hash, keeping the original
 * extension so an exported protocol still names a file a reader recognises.
 * The manifest has nowhere else to put a hash, and `source` may carry no path
 * separators, so this is what lets a committed resource's bytes be found again
 * at `/storage/:hash`.
 */
function storedSource(hash: string, filename: string): string {
  const dot = filename.lastIndexOf('.');
  const extension = dot > 0 ? filename.slice(dot).toLowerCase() : '';
  return /^\.[a-z0-9]{1,16}$/.test(extension) ? `${hash}${extension}` : hash;
}

function hashOfSource(source: string): string | undefined {
  const dot = source.indexOf('.');
  const hash = dot === -1 ? source : source.slice(0, dot);
  return SHA256_HEX.test(hash) ? hash : undefined;
}

function descriptorFromManifestEntry(
  id: string,
  entry: Record<string, unknown>,
): Descriptor | undefined {
  const kind = KindSchema.safeParse(entry.type);
  if (!kind.success || typeof entry.name !== 'string') return undefined;
  return {
    id,
    kind: kind.data,
    name: entry.name,
    status: 'committed',
    ...(typeof entry.source === 'string' ? { source: entry.source } : {}),
  };
}

/**
 * One editing connection's staged resources.
 *
 * Keyed by connection because a stage is the life of one edit: a second tab
 * importing the same file stages its own copy, and closing either one discards
 * only its own.
 */
export class StagedResources {
  readonly secretStorage: SecretStorage = 'plaintext';
  readonly #staged = new Map<string, StagedEntry>();
  readonly #byRequest = new Map<string, string>();
  readonly #promoted = new Set<string>();
  readonly #mintId: () => string;

  constructor(mintId: () => string) {
    this.#mintId = mintId;
  }

  descriptors(): Descriptor[] {
    return [...this.#staged.values()].map((entry) => entry.descriptor);
  }

  /** Idempotent in the request id, so an uncertain retry stages once. */
  stage(
    requestId: string,
    request: StageRequest,
  ): ResourceOutcome<{ descriptor: Descriptor; handle?: string }> {
    const existingId = this.#byRequest.get(requestId);
    const existing =
      existingId === undefined ? undefined : this.#staged.get(existingId);
    if (existing !== undefined) {
      return {
        status: 'ok',
        data: {
          descriptor: existing.descriptor,
          ...(existing.handle === undefined ? {} : { handle: existing.handle }),
        },
      };
    }
    const id = this.#mintId();
    const entry: StagedEntry =
      request.kind === 'secret'
        ? {
            descriptor: {
              id,
              kind: 'apikey',
              name: request.name,
              status: 'staged',
            },
            handle: `staged-secret:${id}`,
            secret: request.value,
          }
        : {
            descriptor: {
              id,
              kind: request.contentKind,
              name: request.name,
              status: 'staged',
              source: request.source,
              byteLength: request.bytes.size,
              contentType: request.contentType,
            },
            bytes: request.bytes,
          };
    this.#staged.set(id, entry);
    this.#byRequest.set(requestId, id);
    return {
      status: 'ok',
      data: {
        descriptor: entry.descriptor,
        ...(entry.handle === undefined ? {} : { handle: entry.handle }),
      },
    };
  }

  /**
   * Stores the bytes and returns the manifest entries naming them. Writing
   * those entries into the `assets` section is the caller's half, so bytes and
   * manifest land in one revision.
   */
  async plan(
    store: AssetStore | undefined,
    promotionId: string,
    resourceIds: readonly string[],
  ): Promise<ResourceOutcome<PromotionPlan>> {
    if (this.#promoted.has(promotionId)) {
      return failure('invalid-request', 'this promotion has already been made');
    }
    const entries: Record<string, unknown> = {};
    const promoted: Descriptor[] = [];
    for (const resourceId of resourceIds) {
      const entry = this.#staged.get(resourceId);
      if (entry === undefined) {
        return failure('not-found', 'no such staged resource', resourceId);
      }
      if (entry.secret !== undefined) {
        entries[resourceId] = {
          name: entry.descriptor.name,
          type: 'apikey',
          value: entry.secret,
        };
        promoted.push({ ...entry.descriptor, status: 'committed' });
        continue;
      }
      if (store === undefined) {
        return failure(
          'unavailable',
          'this deployment has no object storage configured',
          resourceId,
        );
      }
      if (entry.bytes === undefined || entry.descriptor.source === undefined) {
        return failure(
          'invalid-content',
          'staged resource has no bytes',
          resourceId,
        );
      }
      const stored = await store.put(
        new Uint8Array(await entry.bytes.arrayBuffer()),
        entry.descriptor.contentType ?? 'application/octet-stream',
      );
      const source = storedSource(stored.hash, entry.descriptor.source);
      entries[resourceId] = {
        name: entry.descriptor.name,
        type: entry.descriptor.kind,
        source,
      };
      promoted.push({ ...entry.descriptor, status: 'committed', source });
    }
    return { status: 'ok', data: { entries, promoted } };
  }

  completePromotion(promotionId: string, resourceIds: readonly string[]): void {
    this.#promoted.add(promotionId);
    for (const resourceId of resourceIds) this.#staged.delete(resourceId);
  }

  discard(resourceId: string | undefined): ResourceOutcome<undefined> {
    if (resourceId === undefined) {
      this.#staged.clear();
      this.#byRequest.clear();
      return { status: 'ok', data: undefined };
    }
    if (!this.#staged.delete(resourceId)) {
      return failure('not-found', 'no such staged resource', resourceId);
    }
    return { status: 'ok', data: undefined };
  }

  committed(assets: SectionDoc): Descriptor[] {
    const descriptors: Descriptor[] = [];
    for (const [id, entry] of Object.entries(assets)) {
      if (!isRecord(entry)) continue;
      const descriptor = descriptorFromManifestEntry(id, entry);
      if (descriptor !== undefined) descriptors.push(descriptor);
    }
    return descriptors;
  }

  inspect(assets: SectionDoc, resourceId: string): ResourceOutcome<Inspection> {
    const descriptor = this.#descriptor(assets, resourceId);
    if (descriptor === undefined) {
      return failure('not-found', 'no such resource', resourceId);
    }
    return { status: 'ok', data: { descriptor } };
  }

  /**
   * Where the bytes are. A committed resource is served from the object store
   * by content hash, so its URL is immutable and needs no expiry; a staged one
   * has not been stored yet and is inlined.
   */
  async preview(
    assets: SectionDoc,
    resourceId: string,
  ): Promise<ResourceOutcome<Preview>> {
    const descriptor = this.#descriptor(assets, resourceId);
    if (descriptor === undefined) {
      return failure('not-found', 'no such resource', resourceId);
    }
    if (descriptor.kind === 'apikey') {
      return failure('unsupported-kind', 'a secret has no preview', resourceId);
    }
    const staged = this.#staged.get(resourceId);
    if (staged?.bytes !== undefined) {
      const contentType = descriptor.contentType ?? 'application/octet-stream';
      return {
        status: 'ok',
        data: {
          resourceId,
          url: `data:${contentType};base64,${await base64(staged.bytes)}`,
        },
      };
    }
    const hash =
      descriptor.source === undefined
        ? undefined
        : hashOfSource(descriptor.source);
    if (hash === undefined) {
      return failure(
        'not-found',
        'this host holds no bytes for that resource',
        resourceId,
      );
    }
    return { status: 'ok', data: { resourceId, url: `/storage/${hash}` } };
  }

  #descriptor(assets: SectionDoc, resourceId: string): Descriptor | undefined {
    const staged = this.#staged.get(resourceId);
    if (staged !== undefined) return staged.descriptor;
    const entry = assets[resourceId];
    return isRecord(entry)
      ? descriptorFromManifestEntry(resourceId, entry)
      : undefined;
  }
}

/** One staging area per editing connection, for as long as it is open. */
export class StagedResourceRegistry {
  readonly #byConnection = new Map<string, StagedResources>();
  readonly #mintId: () => string;

  constructor(mintId: () => string) {
    this.#mintId = mintId;
  }

  for(key: string): StagedResources {
    const existing = this.#byConnection.get(key);
    if (existing !== undefined) return existing;
    const created = new StagedResources(this.#mintId);
    this.#byConnection.set(key, created);
    return created;
  }

  release(key: string): void {
    this.#byConnection.delete(key);
  }
}
