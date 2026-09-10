import type { z } from 'zod';

import type {
  ResourceDescriptorSchema,
  ResourceGatewayFailureSchema,
  ResourceInspectionSchema,
  ResourceListInputSchema,
  ResourcePreviewSchema,
  ResourceSecretStorageSchema,
  StageResourceInputSchema,
} from '@codaco/protocol-builder/contract/schemas';
import { getActiveProtocolId } from '~/ducks/modules/app';
import {
  addApiKeyAsset,
  deleteAsset,
  importAssetAsync,
} from '~/ducks/modules/protocol/assetManifest';
import { getAssetManifest } from '~/selectors/protocol';
import { getAssetBlobUrl } from '~/utils/assetUtils';
import {
  getGeoJsonVariables,
  getNetworkVariables,
} from '~/utils/protocols/assetTools';

import type { ArchitectStore } from './architectStore.ts';

type Descriptor = z.output<typeof ResourceDescriptorSchema>;
type Failure = z.output<typeof ResourceGatewayFailureSchema>;
type Inspection = z.output<typeof ResourceInspectionSchema>;
type ListInput = z.output<typeof ResourceListInputSchema>;
type Preview = z.output<typeof ResourcePreviewSchema>;
type StageRequest = z.output<typeof StageResourceInputSchema>['request'];

export type ResourceOutcome<TData> =
  | Readonly<{ status: 'ok'; data: TData }>
  | Readonly<{ status: 'failed'; failure: Failure }>;

/** A discard has nothing to answer with, so its success is the status alone. */
export type DiscardOutcome =
  | Readonly<{ status: 'ok' }>
  | Readonly<{ status: 'failed'; failure: Failure }>;

export type StagedResource = Readonly<{
  descriptor: Descriptor;
  handle?: string;
}>;

/**
 * Architect writes an API key's value into the manifest, which is the file the
 * researcher sends to other people. Only the host knows that, which is why the
 * contract asks.
 */
const SECRET_STORAGE: z.output<typeof ResourceSecretStorageSchema> =
  'plaintext';

function failed(
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

/**
 * The contract's resource lifecycle over Architect's asset manifest.
 *
 * Architect has no staging area: an imported file is validated, written to the
 * asset store and entered in the manifest in one operation, and that manifest
 * is the protocol's own — so `stage` here commits, and what the lifecycle
 * still buys is the bookkeeping that follows it. This object remembers which
 * edit brought each resource in, so `discard` can take back exactly that
 * edit's imports and the submit that promotes them can stop treating them as
 * the edit's to remove.
 *
 * Every entry is owned by one edit — a stage editor or a codebook dialog, from
 * the moment it opens to its submit or its cancel. One researcher can have two
 * open at once, a codebook dialog over a stage editor or two tabs, and neither
 * one's cancel may take away the file the other is about to submit; nor may
 * either one's submit promote what the other imported.
 */
export class ResourceBridge {
  readonly #store: ArchitectStore;
  readonly #byRequest = new Map<string, string>();
  /** Which edit imported each staged resource, by resource id. */
  readonly #staged = new Map<string, string>();

  constructor(store: ArchitectStore) {
    this.#store = store;
  }

  /**
   * The protocol's committed resources, plus the named edit's own imports.
   *
   * Another edit's imports are left out entirely rather than reported
   * committed: they are in the manifest underneath, but the edit that brought
   * them in can still take them back, so they are no more part of this
   * protocol than the draft that will name them.
   */
  list(input: ListInput): ResourceOutcome<
    Readonly<{
      secretStorage: typeof SECRET_STORAGE;
      resources: Descriptor[];
    }>
  > {
    const resources = this.#descriptors(input.editId).filter(
      (descriptor) =>
        (input.kinds === undefined || input.kinds.includes(descriptor.kind)) &&
        (input.status === undefined || descriptor.status === input.status),
    );
    return {
      status: 'ok',
      data: { secretStorage: SECRET_STORAGE, resources },
    };
  }

  async stage(
    editId: string,
    requestId: string,
    request: StageRequest,
  ): Promise<ResourceOutcome<StagedResource>> {
    // The kind is part of the key because the contract asks only that a
    // request id be stable across a retry of one intent, not that it be unique
    // across the pickers an editor has open: a secret answered with an earlier
    // upload's descriptor is a resource the submit cannot promote.
    const key = requestKey(editId, request.kind, requestId);
    const alreadyStaged = this.#byRequest.get(key);
    if (alreadyStaged !== undefined) {
      const descriptor = this.#descriptor(alreadyStaged, editId);
      if (descriptor !== undefined) {
        return { status: 'ok', data: this.#stagedResource(descriptor) };
      }
    }

    if (request.kind === 'secret') {
      const action = addApiKeyAsset(request.name, request.value);
      this.#store.dispatch(action);
      return {
        status: 'ok',
        data: this.#record(key, editId, action.payload.id),
      };
    }

    // Named by its content, not by the file the researcher picked: Architect
    // keys the bytes by the asset id, but `source` is what an export writes
    // the file as and what every other host commits by content, and two
    // imports of different pictures both called `portrait.png` must stay two
    // assets wherever the protocol is opened next.
    const openedFor = getActiveProtocolId(this.#store.getState());
    const source = await contentAddressedSource(request.bytes, request.source);
    const file = new File([request.bytes], source, {
      type: request.contentType,
    });
    // Hashing is the one part of this that takes long enough for the
    // researcher to have closed the protocol underneath it, and there is one
    // store: an import that went ahead would enter the manifest of whichever
    // protocol they opened next. Asked here rather than on the way in, which
    // is what the caller's own entry check already did.
    if (getActiveProtocolId(this.#store.getState()) !== openedFor) {
      return failed(
        'invalid-request',
        'the protocol this import was made for is no longer open',
      );
    }
    try {
      const imported = await this.#store
        .dispatch(importAssetAsync({ file, name: request.name }))
        .unwrap();
      return { status: 'ok', data: this.#record(key, editId, imported.id) };
    } catch (error) {
      return failed('invalid-content', importFailureMessage(error));
    }
  }

  /**
   * What a promotion would commit, or why it cannot be made. Nothing here
   * changes: the submit that carries the promotion completes it, so a refused
   * submit leaves the edit's resources still the edit's to discard.
   *
   * A promotion takes the naming edit's own imports and no others — the file
   * another edit is still composing around is not this write's to commit.
   *
   * `resourceIds` is the whole of what is promoted. A handle authorises the
   * secret it stands for and adds nothing: a handle for a resource the write
   * did not name would otherwise commit that secret and stop the edit's
   * cancel taking it back, and the handle for one it did name would promote
   * it twice.
   */
  planPromotion(
    editId: string,
    resourceIds: readonly string[],
    secretHandles: readonly string[] | undefined,
  ): ResourceOutcome<Readonly<{ promoted: Descriptor[]; ids: string[] }>> {
    const ids = [...resourceIds];
    const promoted: Descriptor[] = [];
    for (const id of ids) {
      const descriptor = this.#descriptor(id, editId);
      if (descriptor === undefined || this.#staged.get(id) !== editId) {
        return failed('not-found', 'no such staged resource', id);
      }
      if (
        descriptor.kind === 'apikey' &&
        secretHandles?.includes(secretHandle(id)) !== true
      ) {
        return failed(
          'invalid-request',
          'promoting a staged secret needs the handle staging returned',
          id,
        );
      }
      promoted.push({ ...descriptor, status: 'committed' });
    }
    return { status: 'ok', data: { promoted, ids } };
  }

  /**
   * Hands the promoted resources over to the protocol: they stop being the
   * edit's to discard. Called only once the section naming them is written.
   */
  completePromotion(ids: readonly string[]): void {
    for (const id of ids) this.#staged.delete(id);
  }

  /** Takes back what this edit imported: one resource, or all of them. */
  discard(editId: string, resourceId: string | undefined): DiscardOutcome {
    if (resourceId === undefined) {
      for (const [id, owner] of this.#staged) {
        if (owner !== editId) continue;
        this.#staged.delete(id);
        this.#store.dispatch(deleteAsset(id));
      }
      for (const key of this.#byRequest.keys()) {
        if (key.startsWith(editPrefix(editId))) this.#byRequest.delete(key);
      }
      return { status: 'ok' };
    }
    if (this.#staged.get(resourceId) !== editId) {
      return failed(
        'invalid-request',
        'this resource was not brought in by this edit',
        resourceId,
      );
    }
    this.#staged.delete(resourceId);
    this.#store.dispatch(deleteAsset(resourceId));
    return { status: 'ok' };
  }

  async inspect(
    resourceId: string,
    editId: string | undefined,
  ): Promise<ResourceOutcome<Inspection>> {
    const descriptor = this.#descriptor(resourceId, editId);
    if (descriptor === undefined) {
      return failed('not-found', 'no such resource', resourceId);
    }
    if (descriptor.kind !== 'network' && descriptor.kind !== 'geojson') {
      return { status: 'ok', data: { descriptor } };
    }
    try {
      const variableNames =
        descriptor.kind === 'network'
          ? await getNetworkVariables(resourceId)
          : await getGeoJsonVariables(resourceId);
      return {
        status: 'ok',
        data: {
          descriptor,
          ...(variableNames === null ? {} : { variableNames }),
        },
      };
    } catch {
      return failed(
        'unavailable',
        'this resource could not be read from the asset store',
        resourceId,
      );
    }
  }

  async preview(
    resourceId: string,
    editId: string | undefined,
  ): Promise<ResourceOutcome<Preview>> {
    const descriptor = this.#descriptor(resourceId, editId);
    if (descriptor === undefined) {
      return failed('not-found', 'no such resource', resourceId);
    }
    if (descriptor.kind === 'apikey') {
      return failed('unsupported-kind', 'a secret has no preview', resourceId);
    }
    const url = await getAssetBlobUrl(resourceId);
    if (url === null) {
      return failed(
        'not-found',
        'the asset store holds no bytes for that resource',
        resourceId,
      );
    }
    return { status: 'ok', data: { resourceId, url } };
  }

  #record(key: string, editId: string, resourceId: string): StagedResource {
    this.#byRequest.set(key, resourceId);
    this.#staged.set(resourceId, editId);
    const descriptor = this.#descriptor(resourceId, editId);
    if (descriptor === undefined) {
      throw new Error(`the manifest has no entry for ${resourceId}`);
    }
    return this.#stagedResource(descriptor);
  }

  #stagedResource(descriptor: Descriptor): StagedResource {
    if (descriptor.kind !== 'apikey') return { descriptor };
    return { descriptor, handle: secretHandle(descriptor.id) };
  }

  /**
   * The manifest as descriptors, from the point of view of one edit.
   *
   * An entry that edit brought in is reported staged even though it is
   * committed underneath: it can still take it back out, and a picker offering
   * to discard it is asking about that, not about what storage has done. An
   * entry another edit brought in is reported at all only to that edit.
   */
  #descriptors(editId: string | undefined): Descriptor[] {
    const manifest = getAssetManifest(this.#store.getState());
    const descriptors: Descriptor[] = [];
    for (const [id, entry] of Object.entries(manifest)) {
      const owner = this.#staged.get(id);
      if (owner !== undefined && owner !== editId) continue;
      descriptors.push({
        id,
        kind: entry.type,
        name: entry.name,
        status:
          owner === undefined ? ('committed' as const) : ('staged' as const),
        ...(entry.type === 'apikey' ? {} : { source: entry.source }),
      });
    }
    return descriptors;
  }

  #descriptor(
    resourceId: string,
    editId: string | undefined,
  ): Descriptor | undefined {
    return this.#descriptors(editId).find(({ id }) => id === resourceId);
  }
}

/**
 * What staging answers with for a secret, and the only thing that authorises
 * promoting it. Derived from the asset id rather than remembered, so a host
 * restarted mid-edit still recognises the handle the picker is holding.
 */
function secretHandle(resourceId: string): string {
  return `staged-secret:${resourceId}`;
}

/** Everything one edit's staging requests are keyed under. */
function editPrefix(editId: string): string {
  return `${editId}\u0000`;
}

/** A staging request's identity: whose it is, what it asked for, and its id. */
function requestKey(editId: string, kind: string, requestId: string): string {
  return `${editPrefix(editId)}${kind}\u0000${requestId}`;
}

/**
 * The name a file is committed under: its SHA-256, and the extension of the
 * file the researcher picked.
 *
 * Content-addressed because the caller's filename is not unique — two edits
 * importing different pictures both called `portrait.png` would otherwise
 * commit two manifest entries naming one file, and an export writing the zip
 * could only carry one of them. The extension is kept so a reader of the
 * exported protocol, and Architect's own type detection, still know what the
 * file is.
 */
async function contentAddressedSource(
  bytes: Blob,
  source: string,
): Promise<string> {
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

function importFailureMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const { message } = error;
    if (typeof message === 'string') return message;
  }
  return 'this file could not be imported as a resource';
}
