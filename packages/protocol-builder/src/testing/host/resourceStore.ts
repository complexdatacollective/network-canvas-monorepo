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

/** A discard has nothing to answer with, so its success is the status alone. */
export type DiscardOutcome =
  | Readonly<{ status: 'ok' }>
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
  readonly #promoted = new Map<string, Descriptor[]>();
  /**
   * What staging knew about each promoted resource. The asset manifest records
   * a name, a type and a source; the MIME type and the size are the host's to
   * keep, and a committed image previewed as `application/octet-stream` is one
   * a media element can refuse to play.
   */
  readonly #committed = new Map<string, Descriptor>();
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
      const descriptor = this.#committedDescriptor(id, entry);
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
   * Nothing here is committed: the protocol store writes these entries in the
   * submitting section's own revision, and only then is the promotion
   * completed, so a refused submit leaves staging as it was.
   */
  manifestFor(
    resourceIds: readonly string[],
    secretHandles: readonly string[] | undefined,
  ): ResourceOutcome<
    Readonly<{ entries: Record<string, unknown>; promoted: Descriptor[] }>
  > {
    const entries: Record<string, unknown> = {};
    const promoted: Descriptor[] = [];
    for (const resourceId of resourceIds) {
      const entry = this.#staged.get(resourceId);
      if (entry === undefined) {
        return failure('not-found', 'no such staged resource', resourceId);
      }
      if (entry.secret === undefined) {
        entries[resourceId] = {
          name: entry.descriptor.name,
          type: entry.descriptor.kind,
          source: entry.descriptor.source,
        };
      } else {
        // The handle staging answered with is the only way to promote the
        // secret behind it. A staged resource id is listed to everyone in the
        // protocol; the value it stands for is not, and writing it into the
        // manifest is what puts a credential into the file the researcher
        // sends on.
        if (
          entry.handle === undefined ||
          secretHandles?.includes(entry.handle) !== true
        ) {
          return failure(
            'invalid-request',
            'promoting a staged secret needs the handle staging returned',
            resourceId,
          );
        }
        entries[resourceId] = {
          name: entry.descriptor.name,
          type: 'apikey',
          value: entry.secret,
        };
      }
      promoted.push({ ...entry.descriptor, status: 'committed' });
    }
    return { status: 'ok', data: { entries, promoted } };
  }

  /**
   * The promotion this id already made, if it made one.
   *
   * `promotionId` is stable across an uncertain retry, so a client whose
   * answer was lost asks again with the same id: it is told what was committed
   * rather than that the bytes and manifest entries it cannot see are somebody
   * else's problem.
   */
  completedPromotion(promotionId: string): Descriptor[] | undefined {
    return this.#promoted.get(promotionId);
  }

  completePromotion(
    promotionId: string,
    promoted: readonly Descriptor[],
    resourceIds: readonly string[],
  ): void {
    this.#promoted.set(promotionId, [...promoted]);
    for (const descriptor of promoted) {
      this.#committed.set(descriptor.id, descriptor);
    }
    for (const resourceId of resourceIds) {
      const entry = this.#staged.get(resourceId);
      if (entry?.bytes !== undefined && entry.descriptor.source !== undefined) {
        this.#content.set(entry.descriptor.source, entry.bytes);
      }
      this.#staged.delete(resourceId);
    }
  }

  discard(resourceId: string | undefined): DiscardOutcome {
    if (resourceId === undefined) {
      this.#staged.clear();
      this.#byRequest.clear();
      return { status: 'ok' };
    }
    if (!this.#staged.delete(resourceId)) {
      return failure('not-found', 'no such staged resource', resourceId);
    }
    return { status: 'ok' };
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
      ? this.#committedDescriptor(resourceId, entry)
      : undefined;
  }

  /**
   * A committed resource as this host can describe it: what the manifest
   * records, and what only the host knows — the MIME type and size staging
   * supplied, or the bytes' own when they were seeded rather than staged.
   */
  #committedDescriptor(
    resourceId: string,
    entry: Record<string, unknown>,
  ): Descriptor | undefined {
    const descriptor = descriptorFromManifestEntry(resourceId, entry);
    if (descriptor === undefined) return undefined;
    const bytes =
      descriptor.source === undefined
        ? undefined
        : this.#content.get(descriptor.source);
    const promoted = this.#committed.get(resourceId);
    const contentType =
      promoted?.contentType ??
      (bytes === undefined || bytes.type === '' ? undefined : bytes.type);
    const byteLength = promoted?.byteLength ?? bytes?.size;
    return {
      ...descriptor,
      ...(contentType === undefined ? {} : { contentType }),
      ...(byteLength === undefined ? {} : { byteLength }),
    };
  }
}
