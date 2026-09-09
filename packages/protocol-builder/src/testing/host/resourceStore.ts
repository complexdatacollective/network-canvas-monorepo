import { v4 as uuid } from 'uuid';
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

/**
 * Whose staging a call is asking about: the edit that imported the file, in
 * the session that imported it. Neither alone is the unit — one session can
 * have a codebook dialog open over a stage editor, and two sessions are two
 * principals.
 */
export type EditScope = Readonly<{ sessionId: string; editId: string }>;

type StagedEntry = Readonly<{
  owner: EditScope;
  descriptor: Descriptor;
  /** The name the manifest will record these bytes under, once promoted. */
  contentName?: string;
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

/** Everything one edit's staging requests are keyed under. */
function editPrefix(scope: EditScope): string {
  return `${scope.sessionId}\u0000${scope.editId}\u0000`;
}

/** A staging request's identity: whose it is, what it asked for, and its id. */
function requestKey(scope: EditScope, kind: string, requestId: string): string {
  return `${editPrefix(scope)}${kind}\u0000${requestId}`;
}

function sameEdit(owner: EditScope, scope: EditScope): boolean {
  return owner.sessionId === scope.sessionId && owner.editId === scope.editId;
}

/**
 * The name a promoted file is committed under: its content, and the extension
 * of the file the researcher picked.
 *
 * Content-addressed because the caller's filename is not unique — two edits
 * importing different pictures both called `portrait.png` would otherwise
 * commit one set of bytes under both manifest entries, silently changing an
 * asset an earlier stage already names. The extension is kept so a host
 * serving the file, or an export reading it back, still knows what it is.
 */
async function contentName(bytes: Blob, source: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    await bytes.arrayBuffer(),
  );
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  const dot = source.lastIndexOf('.');
  return `${hex}${dot > 0 ? source.slice(dot).toLowerCase() : ''}`;
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
 * Every staged entry belongs to one edit in one session, and no procedure
 * reaches another edit's: a protocol has as many edits open as it has editors,
 * and an editor may have two of its own, so staging keyed by anything wider
 * would let one cancel take away the file another was about to submit.
 * Committed resources are the protocol's and are shared by everyone.
 */
export class InMemoryResourceStore {
  readonly secretStorage: SecretStorage = 'plaintext';
  readonly #staged = new Map<string, StagedEntry>();
  readonly #byRequest = new Map<string, string>();
  /**
   * What staging knew about each promoted resource. The asset manifest records
   * a name, a type and a source; the MIME type and the size are the host's to
   * keep, and a committed image previewed as `application/octet-stream` is one
   * a media element can refuse to play.
   */
  readonly #committed = new Map<string, Descriptor>();
  /** Committed bytes, by the `source` the manifest names them under. */
  readonly #content: Map<string, Blob>;
  readonly #nextId: () => string;

  constructor(nextId: () => string, content: Readonly<Record<string, Blob>>) {
    this.#nextId = nextId;
    this.#content = new Map(Object.entries(content));
  }

  /** A staged entry, if this edit is the one that staged it. */
  #owned(scope: EditScope, resourceId: string): StagedEntry | undefined {
    const entry = this.#staged.get(resourceId);
    return entry !== undefined && sameEdit(entry.owner, scope)
      ? entry
      : undefined;
  }

  stagedDescriptors(scope: EditScope): Descriptor[] {
    return [...this.#staged.values()]
      .filter((entry) => sameEdit(entry.owner, scope))
      .map((entry) => entry.descriptor);
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

  async stage(
    scope: EditScope,
    requestId: string,
    request: StageRequest,
  ): Promise<
    ResourceOutcome<Readonly<{ descriptor: Descriptor; handle?: string }>>
  > {
    // The kind is part of the key because the contract asks only that a
    // request id be stable across a retry of one intent, not that it be unique
    // across the pickers an editor has open: a secret answered with an earlier
    // upload's descriptor is a resource the submit cannot promote.
    const key = requestKey(scope, request.kind, requestId);
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
            owner: scope,
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
            owner: scope,
            descriptor: {
              id,
              kind: request.contentKind,
              name: request.name,
              status: 'staged',
              source: request.source,
              byteLength: request.bytes.size,
              contentType: request.contentType,
            },
            contentName: await contentName(request.bytes, request.source),
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
    scope: EditScope,
    resourceIds: readonly string[],
    secretHandles: readonly string[] | undefined,
  ): ResourceOutcome<
    Readonly<{ entries: Record<string, unknown>; promoted: Descriptor[] }>
  > {
    const entries: Record<string, unknown> = {};
    const promoted: Descriptor[] = [];
    for (const resourceId of resourceIds) {
      const entry = this.#owned(scope, resourceId);
      if (entry === undefined) {
        return failure('not-found', 'no such staged resource', resourceId);
      }
      if (entry.secret === undefined) {
        entries[resourceId] = {
          name: entry.descriptor.name,
          type: entry.descriptor.kind,
          source: entry.contentName,
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
      promoted.push({
        ...entry.descriptor,
        status: 'committed',
        ...(entry.contentName === undefined
          ? {}
          : { source: entry.contentName }),
      });
    }
    return { status: 'ok', data: { entries, promoted } };
  }

  /**
   * Commits what a written section's promotion named: the bytes under the name
   * the manifest entries record, and the descriptors the host knows more about
   * than the manifest does. Called only once the section itself is written, so
   * a refused submit leaves staging as it was.
   */
  commitPromotion(
    promoted: readonly Descriptor[],
    resourceIds: readonly string[],
  ): void {
    for (const descriptor of promoted) {
      this.#committed.set(descriptor.id, descriptor);
    }
    for (const resourceId of resourceIds) {
      const entry = this.#staged.get(resourceId);
      if (entry?.bytes !== undefined && entry.contentName !== undefined) {
        this.#content.set(entry.contentName, entry.bytes);
      }
      this.#staged.delete(resourceId);
    }
  }

  /** Drops what this edit staged: one resource, or everything it holds. */
  discard(scope: EditScope, resourceId: string | undefined): DiscardOutcome {
    if (resourceId === undefined) {
      for (const [id, entry] of this.#staged) {
        if (sameEdit(entry.owner, scope)) this.#staged.delete(id);
      }
      for (const key of this.#byRequest.keys()) {
        if (key.startsWith(editPrefix(scope))) this.#byRequest.delete(key);
      }
      return { status: 'ok' };
    }
    if (this.#owned(scope, resourceId) === undefined) {
      return failure('not-found', 'no such staged resource', resourceId);
    }
    this.#staged.delete(resourceId);
    return { status: 'ok' };
  }

  inspect(
    assets: SectionDoc,
    resourceId: string,
    scope: EditScope | undefined,
  ): ResourceOutcome<Inspection> {
    const descriptor = this.#descriptor(assets, resourceId, scope);
    if (descriptor === undefined) {
      return failure('not-found', 'no such resource', resourceId);
    }
    return { status: 'ok', data: { descriptor } };
  }

  async preview(
    assets: SectionDoc,
    resourceId: string,
    scope: EditScope | undefined,
  ): Promise<ResourceOutcome<Preview>> {
    const descriptor = this.#descriptor(assets, resourceId, scope);
    if (descriptor === undefined) {
      return failure('not-found', 'no such resource', resourceId);
    }
    if (descriptor.kind === 'apikey') {
      return failure('unsupported-kind', 'a secret has no preview', resourceId);
    }
    const bytes =
      (scope === undefined
        ? undefined
        : this.#owned(scope, resourceId)?.bytes) ??
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
    scope: EditScope | undefined,
  ): Descriptor | undefined {
    const staged =
      scope === undefined ? undefined : this.#owned(scope, resourceId);
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
