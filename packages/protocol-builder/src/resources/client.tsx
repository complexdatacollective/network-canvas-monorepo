import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { v4 as uuid } from 'uuid';

import { createMessageError } from '@codaco/app-i18n/messages';

import type { ProtocolBuilderClient } from '../contract/contract.ts';
import { useProtocolBuilderContext } from '../state/context.ts';
import { resourceFailureMessages } from './resourceMessages.ts';
import {
  resourceFailure,
  resourceOk,
  type ResourceDescriptor,
  type ResourceInspection,
  type ResourceListOptions,
  type ResourcePreview,
  type ResourceResult,
  type ResourceSecretStorage,
  type StageSecretRequest,
  type StageUploadRequest,
  type StagedSecret,
  type StagedSecretHandle,
} from './types.ts';

const UNREACHABLE_MESSAGE = createMessageError(
  resourceFailureMessages.unreachable,
);

/**
 * Runs one contract call so that its answer is always a result.
 *
 * A transport that rejects — a dropped socket, a router that threw — is the
 * same broken promise to a researcher as one that answers `failed`, and
 * neither is something more specific can be said about. The call happens
 * INSIDE the `try`, not before it, so a client that throws synchronously is
 * caught too.
 */
async function called<T>(
  operation: () => Promise<ResourceResult<T>>,
): Promise<ResourceResult<T>> {
  try {
    return await operation();
  } catch {
    return resourceFailure<T>('unavailable', UNREACHABLE_MESSAGE, {
      retryable: true,
    });
  }
}

/**
 * What the editor's resource controls call.
 *
 * Every method is the contract's own `resources.*` procedure with this
 * protocol's id already supplied, plus the two things only the open edit knows:
 * which resources it has staged, and which of those are on their way out.
 */
export type ResourceClient = Readonly<{
  /**
   * Where this host puts a promoted secret's value, or `undefined` until the
   * host has said. A researcher pasting an API key is deciding whether to put
   * a credential into a file they will send to other people, and only the host
   * knows which it is — so nothing is claimed on its behalf before it answers.
   */
  secretStorage: ResourceSecretStorage | undefined;
  list(
    options?: ResourceListOptions,
  ): Promise<ResourceResult<readonly ResourceDescriptor[]>>;
  stageUpload(
    request: StageUploadRequest,
  ): Promise<ResourceResult<ResourceDescriptor>>;
  stageSecret(
    request: StageSecretRequest,
  ): Promise<ResourceResult<StagedSecret>>;
  resolvePreview(resourceId: string): Promise<ResourceResult<ResourcePreview>>;
  inspect(resourceId: string): Promise<ResourceResult<ResourceInspection>>;
  discardStaged(resourceId: string): Promise<ResourceResult<undefined>>;
  /**
   * Whether a field may take this resource, asked of the edit rather than
   * decided by the field: another field may have started discarding it a
   * moment ago, and only the edit knows a discard is in flight.
   */
  referenceStaged(resourceId: string): ResourceResult<undefined>;
}>;

/** What the stage editor's save and cancel do with what the edit staged. */
export type StagedResources = Readonly<{
  staged: readonly ResourceDescriptor[];
  /**
   * Commits every staged resource and its manifest entry, in the host's own
   * atomic operation. Answered before the stage's own submit, so a stage
   * naming a file is never written without the file.
   */
  promote(): Promise<ResourceResult<readonly ResourceDescriptor[]>>;
  /** Drops everything staged in this edit — the cancel path. */
  discardAll(): Promise<ResourceResult<undefined>>;
}>;

type ResourceContextValue = Readonly<{
  client: ResourceClient;
  staged: StagedResources;
}>;

const ResourceContext = createContext<ResourceContextValue | undefined>(
  undefined,
);

export function useResourceClient(): ResourceClient {
  const value = useContext(ResourceContext);
  if (value === undefined) {
    throw new Error(
      'a resource control was rendered outside a stage editor, so it has no edit to stage into',
    );
  }
  return value.client;
}

/** Everything this edit has staged and not yet promoted or discarded. */
export function useStagedResources(): StagedResources {
  const value = useContext(ResourceContext);
  if (value === undefined) {
    throw new Error('staged resources were read outside a stage editor');
  }
  return value.staged;
}

type ProviderProps = Readonly<{ children: ReactNode }>;

/**
 * Tracks what one stage edit has staged.
 *
 * An imported file is staged for the life of the edit, so its id can be
 * referenced by a field before anything is saved; it is promoted with the
 * stage's submit and discarded with its cancel. That decision belongs to the
 * edit rather than to the control that imported the file, which is why the
 * bookkeeping is here and not in a picker.
 */
export function ResourceClientProvider({ children }: ProviderProps) {
  const { client, protocolId } = useProtocolBuilderContext();
  const [staged, setStaged] = useState<readonly ResourceDescriptor[]>([]);
  const [secretStorage, setSecretStorage] = useState<
    ResourceSecretStorage | undefined
  >(undefined);
  const handles = useRef(new Map<string, StagedSecretHandle>());
  const leaving = useRef(new Set<string>());
  const discarded = useRef(new Set<string>());

  const value = useMemo<ResourceContextValue>(
    () =>
      buildResourceContext({
        client,
        protocolId,
        staged,
        setStaged,
        secretStorage,
        setSecretStorage,
        handles: handles.current,
        leaving: leaving.current,
        discarded: discarded.current,
      }),
    [client, protocolId, secretStorage, staged],
  );

  // Where a promoted secret's value comes to rest is a fact the host states in
  // its answer to `list`, and a control that asks a researcher to paste an API
  // key has to be able to say it before they do. Asked once, here, rather than
  // by each control that might need it.
  const readSecretStorage = useRef(value.client.list);
  readSecretStorage.current = value.client.list;
  useEffect(() => {
    void readSecretStorage.current();
  }, []);

  // Whatever is still staged when the edit goes is what nothing saved: the
  // researcher cancelled, or navigated away. Read through a ref so the effect
  // runs once, at the end, over the resources staged by then.
  const discardOnClose = useRef(value.staged.discardAll);
  discardOnClose.current = value.staged.discardAll;
  useEffect(() => () => void discardOnClose.current(), []);

  return <ResourceContext value={value}>{children}</ResourceContext>;
}

type ContextDeps = Readonly<{
  client: ProtocolBuilderClient;
  protocolId: string;
  staged: readonly ResourceDescriptor[];
  setStaged: (
    next: (
      current: readonly ResourceDescriptor[],
    ) => readonly ResourceDescriptor[],
  ) => void;
  secretStorage: ResourceSecretStorage | undefined;
  setSecretStorage: (next: ResourceSecretStorage) => void;
  handles: Map<string, StagedSecretHandle>;
  leaving: Set<string>;
  discarded: Set<string>;
}>;

function buildResourceContext(deps: ContextDeps): ResourceContextValue {
  const { client, protocolId } = deps;
  const resources = client.resources;

  const list = async (
    options?: ResourceListOptions,
  ): Promise<ResourceResult<readonly ResourceDescriptor[]>> =>
    called(async () => {
      const result = await resources.list({
        protocolId,
        ...(options?.kinds === undefined ? {} : { kinds: [...options.kinds] }),
        ...(options?.status === undefined ? {} : { status: options.status }),
      });
      if (result.status !== 'ok') return result;
      deps.setSecretStorage(result.data.secretStorage);
      return resourceOk(result.data.resources);
    });

  const recordStaged = (descriptor: ResourceDescriptor) => {
    deps.setStaged((current) =>
      current.some((entry) => entry.id === descriptor.id)
        ? current
        : [...current, descriptor],
    );
  };

  const forget = (resourceId: string) => {
    deps.handles.delete(resourceId);
    deps.setStaged((current) =>
      current.filter((entry) => entry.id !== resourceId),
    );
  };

  const editorClient: ResourceClient = {
    secretStorage: deps.secretStorage,
    list,

    stageUpload: (request) =>
      called(async () => {
        const result = await resources.stage({
          protocolId,
          requestId: request.requestId,
          request: {
            kind: 'content',
            contentKind: request.kind,
            name: request.name,
            source: request.source,
            contentType: request.contentType,
            bytes: new Blob([request.bytes as BlobPart], {
              type: request.contentType,
            }),
          },
        });
        if (result.status !== 'ok') return result;
        recordStaged(result.data.descriptor);
        return resourceOk(result.data.descriptor);
      }),

    stageSecret: (request) =>
      called(async () => {
        const result = await resources.stage({
          protocolId,
          requestId: request.requestId,
          request: { kind: 'secret', name: request.name, value: request.value },
        });
        if (result.status !== 'ok') return result;
        const { descriptor, handle } = result.data;
        if (handle === undefined) {
          return resourceFailure(
            'unsupported-kind',
            createMessageError(resourceFailureMessages.unreachable),
            { resourceId: descriptor.id },
          );
        }
        deps.handles.set(descriptor.id, handle);
        recordStaged(descriptor);
        return resourceOk({ descriptor, handle });
      }),

    resolvePreview: (resourceId) =>
      called(async () => {
        const result = await resources.preview({ protocolId, resourceId });
        return result.status === 'ok' ? resourceOk(result.data) : result;
      }),

    inspect: (resourceId) =>
      called(async () => {
        const result = await resources.inspect({ protocolId, resourceId });
        return result.status === 'ok' ? resourceOk(result.data) : result;
      }),

    discardStaged: (resourceId) =>
      called(async () => {
        deps.leaving.add(resourceId);
        try {
          const result = await resources.discard({ protocolId, resourceId });
          if (result.status === 'ok') {
            deps.discarded.add(resourceId);
            forget(resourceId);
          }
          return result.status === 'ok' ? resourceOk(undefined) : result;
        } finally {
          deps.leaving.delete(resourceId);
        }
      }),

    referenceStaged: (resourceId) => {
      if (deps.leaving.has(resourceId)) {
        return resourceFailure(
          'not-found',
          createMessageError(resourceFailureMessages.resourceLeaving),
          { resourceId },
        );
      }
      if (deps.discarded.has(resourceId)) {
        return resourceFailure(
          'not-found',
          createMessageError(resourceFailureMessages.resourceDiscarded),
          { resourceId },
        );
      }
      return resourceOk(undefined);
    },
  };

  const staged: StagedResources = {
    staged: deps.staged,
    promote: () =>
      called(async () => {
        const resourceIds = deps.staged.map((descriptor) => descriptor.id);
        if (resourceIds.length === 0) return resourceOk([]);
        const secretHandles = resourceIds
          .map((id) => deps.handles.get(id))
          .filter(
            (handle): handle is StagedSecretHandle => handle !== undefined,
          );
        const result = await resources.promote({
          protocolId,
          promotionId: uuid(),
          resourceIds,
          ...(secretHandles.length === 0 ? {} : { secretHandles }),
        });
        if (result.status !== 'ok') return result;
        for (const id of resourceIds) forget(id);
        return resourceOk(result.data.promoted);
      }),
    discardAll: () =>
      called(async () => {
        if (deps.staged.length === 0) return resourceOk(undefined);
        const result = await resources.discard({ protocolId });
        if (result.status !== 'ok') return result;
        for (const descriptor of deps.staged) forget(descriptor.id);
        return resourceOk(undefined);
      }),
  };

  return { client: editorClient, staged };
}
