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
import type { ProtocolBuilderClient } from '@codaco/protocol-builder-core/contract';

import { useProtocolBuilderContext } from '../state/context.ts';
import type { ResourcePromotion } from '../state/hooks.ts';
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
  /**
   * Which edit this is: what the host keys the staging under, and what a
   * promotion names so only this edit's own files can be committed by it.
   */
  editId: string;
  staged: readonly ResourceDescriptor[];
  /**
   * What the stage's submit carries so the host commits these resources in the
   * section's own revision, or `undefined` when the edit staged nothing.
   *
   * There is no promoting of its own: the submit is the only place the bytes
   * and the section naming them become one revision, so a refused submit
   * leaves the staging exactly as it was and the same files are promoted on
   * the next attempt. It carries no key of its own either: the write's
   * `requestId` is what a retry repeats.
   */
  promotion(): ResourcePromotion | undefined;
  /** Called when a submit carrying that promotion was written. */
  promoted(): void;
  /** Drops everything staged in this edit — the cancel path. */
  discardAll(): Promise<ResourceResult<undefined>>;
}>;

/**
 * Three values rather than one, because they change at different rates and are
 * read by different components.
 *
 * The client is the host's procedures with this protocol's id supplied, and
 * nothing about the edit's own state is in it, so it is the SAME object for
 * the life of the edit. That is what lets an effect that calls the host —
 * resolving a preview, inspecting a file, listing a library — depend on it:
 * held together with what the edit has staged, every one of those would run
 * again each time any field on the stage imported or discarded anything.
 */
const ResourceClientContext = createContext<ResourceClient | undefined>(
  undefined,
);
const StagedResourcesContext = createContext<StagedResources | undefined>(
  undefined,
);
const SecretStorageContext = createContext<ResourceSecretStorage | undefined>(
  undefined,
);

export function useResourceClient(): ResourceClient {
  const client = useContext(ResourceClientContext);
  if (client === undefined) {
    throw new Error(
      'a resource control was rendered outside a stage editor, so it has no edit to stage into',
    );
  }
  return client;
}

/** Everything this edit has staged and not yet promoted or discarded. */
export function useStagedResources(): StagedResources {
  const staged = useContext(StagedResourcesContext);
  if (staged === undefined) {
    throw new Error('staged resources were read outside a stage editor');
  }
  return staged;
}

/**
 * Where this host puts a promoted secret's value, or `undefined` until the host
 * has said.
 *
 * A researcher pasting an API key is deciding whether to put a credential into
 * a file they will send to other people, and only the host knows which it is —
 * so nothing is claimed on its behalf before it answers.
 */
export function useSecretStorage(): ResourceSecretStorage | undefined {
  return useContext(SecretStorageContext);
}

type ProviderProps = Readonly<{
  /**
   * Which edit this is, when the host wants to name it rather than let one be
   * minted here — the harness does, so a test can ask the host what this edit
   * is holding.
   *
   * It has to be different for every edit open in a session: the host keys
   * staging by it, and two editors sharing one id would each be able to
   * promote and discard what the other imported.
   */
  editId?: string;
  children: ReactNode;
}>;

/**
 * Tracks what one stage edit has staged.
 *
 * An imported file is staged for the life of the edit, so its id can be
 * referenced by a field before anything is saved; it is promoted with the
 * stage's submit and discarded with its cancel. That decision belongs to the
 * edit rather than to the control that imported the file, which is why the
 * bookkeeping is here and not in a picker.
 *
 * Mounting this IS the edit opening, so the id is minted here and held for as
 * long as it is mounted. A researcher with a codebook dialog open over a stage
 * editor has two of these, and neither reaches the other's staging: one
 * cancel would otherwise take away the file the other was about to save.
 */
export function ResourceClientProvider({
  editId: named,
  children,
}: ProviderProps) {
  const { client, protocolId } = useProtocolBuilderContext();
  // Minted once for this mount rather than on every render: the id is what the
  // host holds this edit's staged files under, and a second one would leave
  // the files imported under the first unreachable.
  const [minted] = useState(() => uuid());
  const editId = named ?? minted;
  const [staged, setStaged] = useState<readonly ResourceDescriptor[]>([]);
  const [secretStorage, setSecretStorage] = useState<
    ResourceSecretStorage | undefined
  >(undefined);
  const handles = useRef(new Map<string, StagedSecretHandle>());
  const leaving = useRef(new Set<string>());
  const discarded = useRef(new Set<string>());

  const editorClient = useMemo(
    () =>
      buildResourceClient({
        client,
        protocolId,
        editId,
        setStaged,
        setSecretStorage,
        handles: handles.current,
        leaving: leaving.current,
        discarded: discarded.current,
      }),
    [client, protocolId, editId],
  );

  const stagedResources = useMemo(
    () =>
      buildStagedResources({
        client,
        protocolId,
        editId,
        staged,
        setStaged,
        handles: handles.current,
      }),
    [client, protocolId, editId, staged],
  );

  // Where a promoted secret's value comes to rest is a fact the host states in
  // its answer to `list`, and a control that asks a researcher to paste an API
  // key has to be able to say it before they do. Asked once, here, rather than
  // by each control that might need it.
  useEffect(() => {
    void editorClient.list();
  }, [editorClient]);

  // Whatever is still staged when the edit goes is what nothing saved: the
  // researcher cancelled, or navigated away. Read through a ref so the effect
  // runs once, at the end, over the resources staged by then.
  const discardOnClose = useRef(stagedResources.discardAll);
  discardOnClose.current = stagedResources.discardAll;
  useEffect(() => () => void discardOnClose.current(), []);

  return (
    <ResourceClientContext value={editorClient}>
      <SecretStorageContext value={secretStorage}>
        <StagedResourcesContext value={stagedResources}>
          {children}
        </StagedResourcesContext>
      </SecretStorageContext>
    </ResourceClientContext>
  );
}

/**
 * Everything the client is built from, and every one of them holds still for
 * the life of the edit: the two setters are `useState`'s own, and the three
 * collections are refs. That is what makes the client itself hold still.
 */
type ClientDeps = Readonly<{
  client: ProtocolBuilderClient;
  protocolId: string;
  /** The edit every call names, so none of them reaches another's staging. */
  editId: string;
  setStaged: (
    next: (
      current: readonly ResourceDescriptor[],
    ) => readonly ResourceDescriptor[],
  ) => void;
  setSecretStorage: (next: ResourceSecretStorage) => void;
  handles: Map<string, StagedSecretHandle>;
  leaving: Set<string>;
  discarded: Set<string>;
}>;

type StagedDeps = Readonly<{
  client: ProtocolBuilderClient;
  protocolId: string;
  editId: string;
  staged: readonly ResourceDescriptor[];
  setStaged: ClientDeps['setStaged'];
  handles: Map<string, StagedSecretHandle>;
}>;

/** Drops a staged resource from the edit's bookkeeping, wherever it is held. */
function forgetStaged(
  deps: Pick<StagedDeps, 'handles' | 'setStaged'>,
  resourceId: string,
): void {
  deps.handles.delete(resourceId);
  deps.setStaged((current) =>
    current.filter((entry) => entry.id !== resourceId),
  );
}

function buildResourceClient(deps: ClientDeps): ResourceClient {
  const { client, protocolId, editId } = deps;
  const resources = client.resources;

  const list = async (
    options?: ResourceListOptions,
  ): Promise<ResourceResult<readonly ResourceDescriptor[]>> =>
    called(async () => {
      const result = await resources.list({
        protocolId,
        // Named, so the list is the protocol's committed resources AND what
        // this edit has imported. Without it a researcher would not see the
        // file they had just chosen until they had saved the stage.
        editId,
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
    forgetStaged(deps, resourceId);
  };

  return {
    list,

    stageUpload: (request) =>
      called(async () => {
        const result = await resources.stage({
          protocolId,
          editId,
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
          editId,
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
        const result = await resources.preview({
          protocolId,
          editId,
          resourceId,
        });
        return result.status === 'ok' ? resourceOk(result.data) : result;
      }),

    inspect: (resourceId) =>
      called(async () => {
        const result = await resources.inspect({
          protocolId,
          editId,
          resourceId,
        });
        return result.status === 'ok' ? resourceOk(result.data) : result;
      }),

    discardStaged: (resourceId) =>
      called(async () => {
        deps.leaving.add(resourceId);
        try {
          const result = await resources.discard({
            protocolId,
            editId,
            resourceId,
          });
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
}

function buildStagedResources(deps: StagedDeps): StagedResources {
  const { client, protocolId, editId } = deps;
  const resources = client.resources;
  const forget = (resourceId: string) => {
    forgetStaged(deps, resourceId);
  };

  return {
    editId,
    staged: deps.staged,
    promotion: () => {
      const resourceIds = deps.staged.map((descriptor) => descriptor.id);
      if (resourceIds.length === 0) return undefined;
      const secretHandles = resourceIds
        .map((id) => deps.handles.get(id))
        .filter((handle): handle is StagedSecretHandle => handle !== undefined);
      return {
        editId,
        resourceIds,
        ...(secretHandles.length === 0 ? {} : { secretHandles }),
      };
    },
    promoted: () => {
      for (const descriptor of deps.staged) forget(descriptor.id);
    },
    discardAll: () =>
      called(async () => {
        if (deps.staged.length === 0) return resourceOk(undefined);
        // A discard answers with its status and nothing else, so an `ok` is
        // read from the status alone; there is no data key to unwrap.
        // Named, so it drops what THIS edit staged and nothing another editor
        // in the same session is holding.
        const result = await resources.discard({ protocolId, editId });
        if (result.status !== 'ok') return result;
        for (const descriptor of deps.staged) forget(descriptor.id);
        return resourceOk(undefined);
      }),
  };
}
