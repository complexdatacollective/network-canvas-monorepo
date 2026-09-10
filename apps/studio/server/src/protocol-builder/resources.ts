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
} from '@codaco/protocol-builder-core/contract/schemas';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import { MAX_UPLOAD_BYTES, type AssetStore } from '../assets.ts';

type Descriptor = z.output<typeof ResourceDescriptorSchema>;
type Failure = z.output<typeof ResourceGatewayFailureSchema>;
type Inspection = z.output<typeof ResourceInspectionSchema>;
type Preview = z.output<typeof ResourcePreviewSchema>;
type SecretStorage = z.output<typeof ResourceSecretStorageSchema>;
type StageRequest = z.output<typeof StageResourceInputSchema>['request'];

export type ResourceOutcome<TData> =
  | { status: 'ok'; data: TData }
  | { status: 'failed'; failure: Failure };

/** A discard has nothing to answer with, so its success is the status alone. */
export type DiscardOutcome =
  | { status: 'ok' }
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
 * One edit's staged resources.
 *
 * An edit — a stage editor or a codebook dialog, from the moment it opens to
 * its submit or its cancel — is the unit rather than the connection, because a
 * researcher can have two open in one tab: a codebook dialog over a stage
 * editor, where the dialog's cancel would otherwise take away the file the
 * editor was about to submit. The registry below is what holds one of these
 * per edit; nothing in here can reach another's, because another's is a
 * different object.
 */
/**
 * Studio writes a promoted API key's value into the asset manifest, which
 * travels with the protocol. Only the host knows that, which is why the
 * contract asks.
 */
export const SECRET_STORAGE: SecretStorage = 'plaintext';

export class StagedResources {
  readonly secretStorage = SECRET_STORAGE;
  readonly #staged = new Map<string, StagedEntry>();
  readonly #byRequest = new Map<string, string>();
  readonly #mintId: () => string;

  constructor(mintId: () => string) {
    this.#mintId = mintId;
  }

  descriptors(): Descriptor[] {
    return [...this.#staged.values()].map((entry) => entry.descriptor);
  }

  /**
   * Idempotent in the request id, so an uncertain retry stages once.
   *
   * The kind is part of the key because the contract asks only that a request
   * id be stable across a retry of one intent, not that it be unique across
   * the pickers an editor has open: a secret answered with an earlier upload's
   * descriptor is a resource the submit cannot promote.
   */
  stage(
    requestId: string,
    request: StageRequest,
  ): ResourceOutcome<{ descriptor: Descriptor; handle?: string }> {
    const key = `${request.kind}\u0000${requestId}`;
    const existingId = this.#byRequest.get(key);
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
    if (request.kind === 'content' && request.bytes.size === 0) {
      // An empty file promotes into a manifest entry an interview would try to
      // show: an image with no pixels, a roster with no network. The contract's
      // own host refuses it, and a picker that offers it here and nowhere else
      // would be Studio disagreeing with the contract it serves.
      return failure('invalid-content', 'that file is empty');
    }
    if (request.kind === 'content' && request.bytes.size > MAX_UPLOAD_BYTES) {
      // Refused before the blob is kept rather than after: the bytes reach the
      // handler with the request, and what this bounds is how long an
      // authenticated caller can make the process hold them — an edit's
      // staging lives until its submit or its cancel.
      return failure(
        'too-large',
        `this deployment stores at most ${MAX_UPLOAD_BYTES} bytes per resource`,
      );
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
   * Stores the bytes and returns the manifest entries naming them. Writing
   * those entries into the `assets` section is the submit's half, so the bytes
   * and the section naming them land in one revision — and until it does,
   * nothing here is committed and the staged resources are still staged.
   */
  async plan(
    store: AssetStore | undefined,
    resourceIds: readonly string[],
    secretHandles: readonly string[] | undefined,
  ): Promise<ResourceOutcome<PromotionPlan>> {
    const entries: Record<string, unknown> = {};
    const promoted: Descriptor[] = [];
    for (const resourceId of resourceIds) {
      const entry = this.#staged.get(resourceId);
      if (entry === undefined) {
        return failure('not-found', 'no such staged resource', resourceId);
      }
      if (entry.secret !== undefined) {
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
      // An object store that is unreachable is the researcher's situation
      // rather than the host's: the contract has a retryable failure for it,
      // and reaching the generic error boundary instead would tell an editor
      // that has staged a file to give up on a promotion it could make a
      // minute later.
      let stored: Awaited<ReturnType<AssetStore['put']>>;
      try {
        stored = await store.put(
          new Uint8Array(await entry.bytes.arrayBuffer()),
          entry.descriptor.contentType ?? 'application/octet-stream',
        );
      } catch {
        return failure(
          'unavailable',
          'the object store could not be reached',
          resourceId,
        );
      }
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

  /**
   * Drops what a written section's promotion took. Called only once that
   * section is written, so a refused submit leaves staging as it was.
   */
  completePromotion(resourceIds: readonly string[]): void {
    for (const resourceId of resourceIds) this.#staged.delete(resourceId);
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

  /** This edit's staged resource, or the protocol's committed one. */
  inspect(assets: SectionDoc, resourceId: string): ResourceOutcome<Inspection> {
    const staged = this.#staged.get(resourceId);
    return staged === undefined
      ? committedInspection(assets, resourceId)
      : { status: 'ok', data: { descriptor: staged.descriptor } };
  }

  /**
   * Where the bytes are. A staged resource has not been stored yet and is
   * inlined; a committed one is served from the object store by content hash,
   * so its URL is immutable and needs no expiry.
   */
  async preview(
    assets: SectionDoc,
    resourceId: string,
  ): Promise<ResourceOutcome<Preview>> {
    const staged = this.#staged.get(resourceId);
    if (staged === undefined) return committedPreview(assets, resourceId);
    if (staged.descriptor.kind === 'apikey') {
      return failure('unsupported-kind', 'a secret has no preview', resourceId);
    }
    if (staged.bytes === undefined) {
      return failure(
        'not-found',
        'this host holds no bytes for that resource',
        resourceId,
      );
    }
    const contentType =
      staged.descriptor.contentType ?? 'application/octet-stream';
    return {
      status: 'ok',
      data: {
        resourceId,
        url: `data:${contentType};base64,${await base64(staged.bytes)}`,
      },
    };
  }
}

// What the protocol itself holds, which every caller may reach: a resource
// listed, inspected or previewed without naming an edit is a committed one,
// and an edit's staged imports are not the protocol's until a submit promotes
// them.

export function committedDescriptors(assets: SectionDoc): Descriptor[] {
  const descriptors: Descriptor[] = [];
  for (const [id, entry] of Object.entries(assets)) {
    if (!isRecord(entry)) continue;
    const descriptor = descriptorFromManifestEntry(id, entry);
    if (descriptor !== undefined) descriptors.push(descriptor);
  }
  return descriptors;
}

export function committedInspection(
  assets: SectionDoc,
  resourceId: string,
): ResourceOutcome<Inspection> {
  const descriptor = committedDescriptor(assets, resourceId);
  if (descriptor === undefined) {
    return failure('not-found', 'no such resource', resourceId);
  }
  return { status: 'ok', data: { descriptor } };
}

export function committedPreview(
  assets: SectionDoc,
  resourceId: string,
): ResourceOutcome<Preview> {
  const descriptor = committedDescriptor(assets, resourceId);
  if (descriptor === undefined) {
    return failure('not-found', 'no such resource', resourceId);
  }
  if (descriptor.kind === 'apikey') {
    return failure('unsupported-kind', 'a secret has no preview', resourceId);
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

function committedDescriptor(
  assets: SectionDoc,
  resourceId: string,
): Descriptor | undefined {
  const entry = assets[resourceId];
  return isRecord(entry)
    ? descriptorFromManifestEntry(resourceId, entry)
    : undefined;
}

/**
 * One staging area per edit, for as long as that edit is open.
 *
 * The router keys these by the draft, the owner and the edit, so the two
 * boundaries the contract names are the same boundary here: one editor's
 * staging is unreachable from another's, and one edit's is unreachable from
 * the second edit its own researcher has open.
 */
export class StagedResourceRegistry {
  readonly #byEdit = new Map<string, OpenEdit>();
  readonly #mintId: () => string;

  constructor(mintId: () => string) {
    this.#mintId = mintId;
  }

  for(key: string, owner: string, at: number): StagedResources {
    const existing = this.#byEdit.get(key);
    if (existing !== undefined) return existing.resources;
    const resources = new StagedResources(this.#mintId);
    this.#byEdit.set(key, { owner, resources, touchedAt: at });
    return resources;
  }

  /** What one edit staged, if that edit has staged anything. */
  opened(key: string): StagedResources | undefined {
    return this.#byEdit.get(key)?.resources;
  }

  /** An owner that called is here, so every edit it has open is too. */
  touch(prefix: string, at: number): void {
    for (const [key, edit] of this.#byEdit) {
      if (key.startsWith(prefix)) edit.touchedAt = at;
    }
  }

  /**
   * Drops what an owner that has gone quiet was holding.
   *
   * The unary plane has no close to observe — a client whose network refuses
   * WebSockets, or a script — so the only sign of life there is a call, and an
   * owner that has made none since `before` has gone. One with a channel is
   * left alone however long the researcher spends not calling anything, for
   * the reason its leases are: losing an import under an open editor is not a
   * thing that may happen.
   */
  expire(before: number, connected: (owner: string) => boolean): void {
    for (const [key, edit] of this.#byEdit) {
      if (edit.touchedAt > before || connected(edit.owner)) continue;
      this.#byEdit.delete(key);
    }
  }

  /**
   * Drops every edit under a prefix: an owner whose reconnection never came
   * takes all of its open edits with it, however many it had.
   */
  releaseMatching(prefix: string): void {
    for (const key of this.#byEdit.keys()) {
      if (key.startsWith(prefix)) this.#byEdit.delete(key);
    }
  }
}

/** One open edit's staging, and what says its owner is still here. */
type OpenEdit = {
  owner: string;
  resources: StagedResources;
  touchedAt: number;
};
