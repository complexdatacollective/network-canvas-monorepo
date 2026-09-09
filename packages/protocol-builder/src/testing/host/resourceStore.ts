import { v4 as uuid } from 'uuid';
import { z } from 'zod';

import type { SectionDoc } from '@codaco/studio-sync/apply';

import type {
  ResourceDescriptorSchema,
  ResourceGatewayFailureSchema,
  ResourceInspectionSchema,
  ResourcePreviewSchema,
  ResourceSecretStorageSchema,
  Revision,
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
  /**
   * The session that staged this. Staging belongs to the edit that imported
   * the file: a collaborator cancelling their own edit must not take away
   * what somebody else is about to submit, and nobody may promote bytes they
   * never staged.
   */
  owner: string;
  descriptor: Descriptor;
  handle?: string;
  bytes?: Blob;
  secret?: string;
}>;

/** What one `promotionId` committed, for the retry that asks about it again. */
type CompletedPromotion = Readonly<{
  revision: Revision;
  promoted: Descriptor[];
  /**
   * The section a `create` minted for this promotion. A retried create cannot
   * be answered without it: the host would mint a second id, and the retry
   * would be told about a section its first attempt never made.
   */
  createdSection?: string;
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

/** A staging request's identity: whose it is, what it asked for, and its id. */
function requestKey(
  sessionId: string,
  kind: string,
  requestId: string,
): string {
  return `${sessionId}\u0000${kind}\u0000${requestId}`;
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
 * Every staged entry belongs to the session that staged it, and no procedure
 * reaches another session's: a protocol has as many edits open as it has
 * editors, and staging that ignored them would let one editor's cancel take
 * away the file another was about to submit. Committed resources are the
 * protocol's and are shared by everyone.
 */
export class InMemoryResourceStore {
  readonly secretStorage: SecretStorage = 'plaintext';
  readonly #staged = new Map<string, StagedEntry>();
  readonly #byRequest = new Map<string, string>();
  readonly #promoted = new Map<string, CompletedPromotion>();
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

  /** A staged entry, if this session is the one that staged it. */
  #owned(sessionId: string, resourceId: string): StagedEntry | undefined {
    const entry = this.#staged.get(resourceId);
    return entry?.owner === sessionId ? entry : undefined;
  }

  #ownedBy(sessionId: string): StagedEntry[] {
    return [...this.#staged.values()].filter(
      (entry) => entry.owner === sessionId,
    );
  }

  stagedDescriptors(sessionId: string): Descriptor[] {
    return this.#ownedBy(sessionId).map((entry) => entry.descriptor);
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
    sessionId: string,
    requestId: string,
    request: StageRequest,
  ): ResourceOutcome<Readonly<{ descriptor: Descriptor; handle?: string }>> {
    // The kind is part of the key because the contract asks only that a
    // request id be stable across a retry of one intent, not that it be unique
    // across the pickers an editor has open: a secret answered with an earlier
    // upload's descriptor is a resource the submit cannot promote.
    const key = requestKey(sessionId, request.kind, requestId);
    const existingId = this.#byRequest.get(key);
    const existing =
      existingId === undefined ? undefined : this.#staged.get(existingId);
    if (existing !== undefined) {
      return { status: 'ok', data: existing };
    }
    if (request.kind === 'content' && request.bytes.size === 0) {
      // An empty file promotes into a manifest entry an interview would try to
      // show: an image with no pixels, a roster with no network.
      return failure('invalid-content', 'that file is empty');
    }
    const id = this.#nextId();
    const entry: StagedEntry =
      request.kind === 'secret'
        ? {
            owner: sessionId,
            descriptor: {
              id,
              kind: 'apikey',
              name: request.name,
              status: 'staged',
            },
            // Minted independently of the resource id, which `list` shows to
            // everyone in the protocol: a handle derived from that id would be
            // one any collaborator could work out, and the handle is the whole
            // of what stops a secret being promoted by somebody who never
            // staged it.
            handle: `staged-secret:${uuid()}`,
            secret: request.value,
          }
        : {
            owner: sessionId,
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
    this.#byRequest.set(key, id);
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
    sessionId: string,
    resourceIds: readonly string[],
    secretHandles: readonly string[] | undefined,
  ): ResourceOutcome<
    Readonly<{ entries: Record<string, unknown>; promoted: Descriptor[] }>
  > {
    const entries: Record<string, unknown> = {};
    const promoted: Descriptor[] = [];
    for (const resourceId of resourceIds) {
      const entry = this.#owned(sessionId, resourceId);
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
   * The submit this promotion id already made, if it made one: the revision it
   * wrote and what it committed.
   *
   * `promotionId` is stable across an uncertain retry, so a client whose
   * answer was lost asks again with the same id and is told what that attempt
   * committed. Answering it is the whole of the retry: writing the section a
   * second time would make a revision nothing changed in, and by then the
   * editor may have given the lock back, which would turn a save that
   * succeeded into a refusal the researcher is told to discard a draft over.
   */
  completedPromotion(promotionId: string): CompletedPromotion | undefined {
    return this.#promoted.get(promotionId);
  }

  completePromotion(
    promotionId: string,
    promoted: readonly Descriptor[],
    resourceIds: readonly string[],
    revision: Revision,
    createdSection?: string,
  ): void {
    this.#promoted.set(promotionId, {
      revision,
      promoted: [...promoted],
      ...(createdSection === undefined ? {} : { createdSection }),
    });
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

  /** Drops what this session staged: one resource, or its whole edit. */
  discard(sessionId: string, resourceId: string | undefined): DiscardOutcome {
    if (resourceId === undefined) {
      for (const [id, entry] of this.#staged) {
        if (entry.owner === sessionId) this.#staged.delete(id);
      }
      for (const key of this.#byRequest.keys()) {
        if (key.startsWith(requestKey(sessionId, '', ''))) {
          this.#byRequest.delete(key);
        }
      }
      return { status: 'ok' };
    }
    if (this.#owned(sessionId, resourceId) === undefined) {
      return failure('not-found', 'no such staged resource', resourceId);
    }
    this.#staged.delete(resourceId);
    return { status: 'ok' };
  }

  inspect(
    assets: SectionDoc,
    resourceId: string,
    sessionId: string,
  ): ResourceOutcome<Inspection> {
    const descriptor = this.#descriptor(assets, resourceId, sessionId);
    if (descriptor === undefined) {
      return failure('not-found', 'no such resource', resourceId);
    }
    return { status: 'ok', data: { descriptor } };
  }

  async preview(
    assets: SectionDoc,
    resourceId: string,
    sessionId: string,
  ): Promise<ResourceOutcome<Preview>> {
    const descriptor = this.#descriptor(assets, resourceId, sessionId);
    if (descriptor === undefined) {
      return failure('not-found', 'no such resource', resourceId);
    }
    if (descriptor.kind === 'apikey') {
      return failure('unsupported-kind', 'a secret has no preview', resourceId);
    }
    const bytes =
      this.#owned(sessionId, resourceId)?.bytes ??
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

  #descriptor(
    assets: SectionDoc,
    resourceId: string,
    sessionId: string,
  ): Descriptor | undefined {
    const staged = this.#owned(sessionId, resourceId);
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
