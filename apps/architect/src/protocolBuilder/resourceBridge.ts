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
 * still buys is the bookkeeping that follows it. This object remembers the
 * resources the open edit brought in, so `discard` can take them back out and
 * `promote` can stop treating them as the edit's to remove.
 */
export class ResourceBridge {
  readonly #store: ArchitectStore;
  readonly #byRequest = new Map<string, string>();
  readonly #handles = new Map<string, string>();
  readonly #staged = new Set<string>();
  readonly #promotions = new Set<string>();

  constructor(store: ArchitectStore) {
    this.#store = store;
  }

  list(input: ListInput): ResourceOutcome<
    Readonly<{
      secretStorage: typeof SECRET_STORAGE;
      resources: Descriptor[];
    }>
  > {
    const resources = this.#descriptors().filter(
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
    requestId: string,
    request: StageRequest,
  ): Promise<ResourceOutcome<StagedResource>> {
    const alreadyStaged = this.#byRequest.get(requestId);
    if (alreadyStaged !== undefined) {
      const descriptor = this.#descriptor(alreadyStaged);
      if (descriptor !== undefined) {
        return { status: 'ok', data: this.#stagedResource(descriptor) };
      }
    }

    if (request.kind === 'secret') {
      const action = addApiKeyAsset(request.name, request.value);
      this.#store.dispatch(action);
      return { status: 'ok', data: this.#record(requestId, action.payload.id) };
    }

    const file = new File([request.bytes], request.source, {
      type: request.contentType,
    });
    try {
      const imported = await this.#store
        .dispatch(importAssetAsync(file))
        .unwrap();
      return { status: 'ok', data: this.#record(requestId, imported.id) };
    } catch (error) {
      return failed('invalid-content', importFailureMessage(error));
    }
  }

  promote(
    promotionId: string,
    resourceIds: readonly string[],
    secretHandles: readonly string[] | undefined,
  ): ResourceOutcome<Readonly<{ promoted: Descriptor[] }>> {
    if (this.#promotions.has(promotionId)) {
      return failed('invalid-request', 'this promotion has already been made');
    }
    const ids = [
      ...resourceIds,
      ...(secretHandles ?? []).map((handle) => this.#handles.get(handle) ?? ''),
    ];
    const promoted: Descriptor[] = [];
    for (const id of ids) {
      const descriptor = this.#descriptor(id);
      if (descriptor === undefined || !this.#staged.has(id)) {
        return failed('not-found', 'no such staged resource', id);
      }
      promoted.push({ ...descriptor, status: 'committed' });
    }
    this.#promotions.add(promotionId);
    for (const id of ids) this.#staged.delete(id);
    return { status: 'ok', data: { promoted } };
  }

  discard(resourceId: string | undefined): ResourceOutcome<undefined> {
    if (resourceId === undefined) {
      for (const id of this.#staged) this.#store.dispatch(deleteAsset(id));
      this.#staged.clear();
      this.#byRequest.clear();
      return { status: 'ok', data: undefined };
    }
    if (!this.#staged.delete(resourceId)) {
      return failed(
        'invalid-request',
        'this resource was not brought in by the open edit',
        resourceId,
      );
    }
    this.#store.dispatch(deleteAsset(resourceId));
    return { status: 'ok', data: undefined };
  }

  async inspect(resourceId: string): Promise<ResourceOutcome<Inspection>> {
    const descriptor = this.#descriptor(resourceId);
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

  async preview(resourceId: string): Promise<ResourceOutcome<Preview>> {
    const descriptor = this.#descriptor(resourceId);
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

  #record(requestId: string, resourceId: string): StagedResource {
    this.#byRequest.set(requestId, resourceId);
    this.#staged.add(resourceId);
    const descriptor = this.#descriptor(resourceId);
    if (descriptor === undefined) {
      throw new Error(`the manifest has no entry for ${resourceId}`);
    }
    return this.#stagedResource(descriptor);
  }

  #stagedResource(descriptor: Descriptor): StagedResource {
    if (descriptor.kind !== 'apikey') return { descriptor };
    const handle = `staged-secret:${descriptor.id}`;
    this.#handles.set(handle, descriptor.id);
    return { descriptor, handle };
  }

  /**
   * The manifest as descriptors. An entry the open edit brought in is reported
   * staged even though it is committed underneath: the edit can still take it
   * back out, and a picker offering to discard it is asking about that, not
   * about what storage has done.
   */
  #descriptors(): Descriptor[] {
    const manifest = getAssetManifest(this.#store.getState());
    return Object.entries(manifest).map(([id, entry]) => ({
      id,
      kind: entry.type,
      name: entry.name,
      status: this.#staged.has(id)
        ? ('staged' as const)
        : ('committed' as const),
      ...(entry.type === 'apikey' ? {} : { source: entry.source }),
    }));
  }

  #descriptor(resourceId: string): Descriptor | undefined {
    return this.#descriptors().find(({ id }) => id === resourceId);
  }
}

function importFailureMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const { message } = error;
    if (typeof message === 'string') return message;
  }
  return 'this file could not be imported as a resource';
}
