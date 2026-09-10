import { render } from '@testing-library/react';
import { useEffect, type ReactNode } from 'react';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import type { ProtocolBuilderClient } from '../../../contract/contract.ts';
import {
  useStageEditorForm,
  type StageFormStoreApi,
} from '../../../form/stageEditorContext.ts';
import StageEditorShell, {
  type StageEditorShellProps,
} from '../../../form/StageEditorShell.tsx';
import { ProtocolBuilder } from '../../../ProtocolBuilder.tsx';
import BuilderSection from '../../../sections/BuilderSection.tsx';
import { StageEditSession } from '../../../stageEdit.tsx';
import type { InMemoryHost } from '../../../testing/host/createInMemoryHost.ts';
import {
  ResourceClientProvider,
  useResourceClient,
  type ResourceClient,
} from '../../client.tsx';
import type { ResourceDescriptor } from '../../types.ts';
import { TEST_EDIT_ID } from './resourceContext.tsx';
import {
  committedManifest,
  createResourceHost,
  stagedResources,
  STAGE_SECTION,
  type ResourceHostSeed,
} from './resourceHost.ts';

export type RenderResourceEditorOptions = ResourceHostSeed &
  Readonly<{
    /**
     * Wraps the seeded host's own client, for a test about a host that
     * refuses, holds its answer, counts what it is asked, or reads more out of
     * a file than the in-memory store does.
     */
    client?: (host: InMemoryHost) => ProtocolBuilderClient;
    /** Somebody else holds the stage, so this editor opens read-only. */
    readOnly?: boolean;
    /** The host's action chrome; a submit button, for a test that saves. */
    actions?: StageEditorShellProps['actions'];
    children: ReactNode;
  }>;

/**
 * A resource field in the editor it really lives in: the package's own form
 * shell, inside a section, inside a stage edit opened over the in-memory host.
 *
 * Nothing here reaches around the field to set its value or to hand it a
 * resource client of its own, so what the tests assert on is what the stage
 * draft would be saved from, and what a field stages is staging the edit can
 * promote or discard.
 */
export type RenderedResourceEditor = Readonly<{
  host: InMemoryHost;
  /** The client the editor is mounted over, which may be a wrapped one. */
  client: ProtocolBuilderClient;
  /**
   * The edit this editor has open, which is what the host holds its staged
   * files under. A test staging or discarding through the host names it.
   */
  editId: string;
  /** Everything the stage form currently holds, by field name. */
  formValues: () => Record<string, unknown>;
  fieldValue: (name: string) => unknown;
  /**
   * The very client the fields call, for a test that has to act on the edit
   * from outside a control — a modal browser hides the rest of the editor from
   * a test exactly as it does from the researcher.
   */
  resourceClient: () => ResourceClient;
  /** What the host says is staged right now. */
  staged: () => Promise<readonly ResourceDescriptor[]>;
  /** The protocol's own asset manifest, as the host currently holds it. */
  manifest: () => SectionDoc;
}>;

/** A second connection, which is a second lock owner. */
const COLLABORATOR = {
  sessionId: 'session-2',
  userId: 'user-2',
  displayName: 'Grace',
};

export function renderResourceEditor(
  options: RenderResourceEditorOptions,
): RenderedResourceEditor {
  const { client: wrap, readOnly, actions, children } = options;
  const host = createResourceHost({
    ...(options.stageType === undefined
      ? {}
      : { stageType: options.stageType }),
    ...(options.fields === undefined ? {} : { fields: options.fields }),
    ...(options.resources === undefined
      ? {}
      : { resources: options.resources }),
    ...(options.nextId === undefined ? {} : { nextId: options.nextId }),
  });
  const client = wrap === undefined ? host.client : wrap(host);

  // Taken before the editor mounts, so its own acquire is answered `readOnly`
  // — the state a researcher reaches by opening a stage somebody else has.
  if (readOnly === true) {
    void host
      .asCollaborator(COLLABORATOR)
      .acquireLock({ protocolId: host.protocolId, sectionId: STAGE_SECTION });
  }

  const store: { current: StageFormStoreApi | undefined } = {
    current: undefined,
  };
  const resources: { current: ResourceClient | undefined } = {
    current: undefined,
  };

  function CaptureStore() {
    const { storeApi } = useStageEditorForm();
    useEffect(() => {
      store.current = storeApi;
    }, [storeApi]);
    return null;
  }

  function CaptureResourceClient() {
    resources.current = useResourceClient();
    return null;
  }

  render(
    <DialogProvider>
      <ProtocolBuilder client={client} protocolId={host.protocolId}>
        <ResourceClientProvider editId={TEST_EDIT_ID}>
          <CaptureResourceClient />
          <StageEditSession target={{ sectionId: STAGE_SECTION }}>
            <StageEditorShell {...(actions === undefined ? {} : { actions })}>
              <BuilderSection title="Resources">
                <CaptureStore />
                {children}
              </BuilderSection>
            </StageEditorShell>
          </StageEditSession>
        </ResourceClientProvider>
      </ProtocolBuilder>
    </DialogProvider>,
  );

  const formValues = (): Record<string, unknown> =>
    store.current?.getState().getFormValues() ?? {};

  return {
    host,
    client,
    editId: TEST_EDIT_ID,
    formValues,
    fieldValue: (name: string): unknown => formValues()[name],
    resourceClient: () => {
      if (resources.current === undefined) {
        throw new Error('the editor rendered without a resource client');
      }
      return resources.current;
    },
    staged: () => stagedResources(client, host.protocolId, TEST_EDIT_ID),
    manifest: () => committedManifest(host),
  };
}
