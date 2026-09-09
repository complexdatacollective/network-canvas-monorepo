import { z } from 'zod';

import type { SectionDoc } from '@codaco/studio-sync/apply';

import type {
  ResourceDescriptorSchema,
  ResourceGatewayFailureSchema,
  ResourceInspectionSchema,
  ResourcePreviewSchema,
  ResourceSecretStorageSchema,
  StageResourceInputSchema,
} from '../../contract/schemas.ts';

type Descriptor = z.output<typeof ResourceDescriptorSchema>;
type Failure = z.output<typeof ResourceGatewayFailureSchema>;
type Inspection = z.output<typeof ResourceInspectionSchema>;
type Preview = z.output<typeof ResourcePreviewSchema>;
type SecretStorage = z.output<typeof ResourceSecretStorageSchema>;
type StageRequest = z.output<typeof StageResourceInputSchema>['request'];

export type ResourceOutcome<TData> =
  | Readonly<{ status: 'ok'; data: TData }>
  | Readonly<{ status: 'failed'; failure: Failure }>;

type StagedEntry = Readonly<{
  descriptor: Descriptor;
  handle?: string;
  bytes?: Blob;
  secret?: string;
}>;

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

async function base64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function descriptorFromManifestEntry(
  id: string,
  entry: Record<string, unknown>,
): Descriptor | undefined {
  const kind = entry.type;
  const name = entry.name;
  if (typeof kind !== 'string' || typeof name !== 'string') return undefined;
  const parsed = KindSchema.safeParse(kind);
  if (!parsed.success) return undefined;
  return {
    id,
    kind: parsed.data,
    name,
    status: 'committed',
    ...(typeof entry.source === 'string' ? { source: entry.source } : {}),
  };
}

const KindSchema = z.enum([
  'audio',
  'geojson',
  'image',
  'network',
  'video',
  'apikey',
]);

/**
 * Staged resources for the in-memory host: bytes and secrets an edit imported,
 * kept until its submit promotes them or its cancel drops them.
 *
 * One staging area per protocol rather than one per connection, which a host
 * serving several editors would need: a `discard` with no id here drops
 * everything staged, not everything this caller staged.
 */
export class InMemoryResourceStore {
  readonly secretStorage: SecretStorage = 'plaintext';
  readonly #staged = new Map<string, StagedEntry>();
  readonly #byRequest = new Map<string, string>();
  readonly #promoted = new Set<string>();
  readonly #content: Map<string, Blob>;
  readonly #nextId: () => string;

  constructor(nextId: () => string, content: Readonly<Record<string, Blob>>) {
    this.#nextId = nextId;
    this.#content = new Map(Object.entries(content));
  }

  stagedDescriptors(): Descriptor[] {
    return [...this.#staged.values()].map((entry) => entry.descriptor);
  }

  committedDescriptors(assets: SectionDoc): Descriptor[] {
    const descriptors: Descriptor[] = [];
    for (const [id, entry] of Object.entries(assets)) {
      if (!isRecord(entry)) continue;
      const descriptor = descriptorFromManifestEntry(id, entry);
      if (descriptor !== undefined) descriptors.push(descriptor);
    }
    return descriptors;
  }

  stage(
    requestId: string,
    request: StageRequest,
  ): ResourceOutcome<Readonly<{ descriptor: Descriptor; handle?: string }>> {
    const existingId = this.#byRequest.get(requestId);
    const existing =
      existingId === undefined ? undefined : this.#staged.get(existingId);
    if (existing !== undefined) {
      return { status: 'ok', data: existing };
    }
    const id = this.#nextId();
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
   * The manifest entries for a promotion, or the reason it cannot be made.
   * Writing them into the `assets` section is the protocol store's half, so
   * bytes and manifest land in one revision.
   */
  manifestFor(
    promotionId: string,
    resourceIds: readonly string[],
  ): ResourceOutcome<
    Readonly<{ entries: Record<string, unknown>; promoted: Descriptor[] }>
  > {
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
      entries[resourceId] =
        entry.secret === undefined
          ? {
              name: entry.descriptor.name,
              type: entry.descriptor.kind,
              source: entry.descriptor.source,
            }
          : {
              name: entry.descriptor.name,
              type: 'apikey',
              value: entry.secret,
            };
      promoted.push({ ...entry.descriptor, status: 'committed' });
    }
    return { status: 'ok', data: { entries, promoted } };
  }

  completePromotion(promotionId: string, resourceIds: readonly string[]): void {
    this.#promoted.add(promotionId);
    for (const resourceId of resourceIds) {
      const entry = this.#staged.get(resourceId);
      if (entry?.bytes !== undefined && entry.descriptor.source !== undefined) {
        this.#content.set(entry.descriptor.source, entry.bytes);
      }
      this.#staged.delete(resourceId);
    }
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

  inspect(assets: SectionDoc, resourceId: string): ResourceOutcome<Inspection> {
    const descriptor = this.#descriptor(assets, resourceId);
    if (descriptor === undefined) {
      return failure('not-found', 'no such resource', resourceId);
    }
    return { status: 'ok', data: { descriptor } };
  }

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
    const bytes =
      this.#staged.get(resourceId)?.bytes ??
      (descriptor.source === undefined
        ? undefined
        : this.#content.get(descriptor.source));
    if (bytes === undefined) {
      return failure(
        'not-found',
        'this host holds no bytes for that resource',
        resourceId,
      );
    }
    const contentType = descriptor.contentType ?? 'application/octet-stream';
    return {
      status: 'ok',
      data: {
        resourceId,
        url: `data:${contentType};base64,${await base64(bytes)}`,
      },
    };
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
