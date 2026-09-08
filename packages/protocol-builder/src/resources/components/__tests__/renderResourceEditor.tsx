import { render } from '@testing-library/react';
import { useEffect, type ReactNode } from 'react';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import { useStageEditorController } from '../../../controller.ts';
import {
  useStageEditorForm,
  type StageFormStoreApi,
} from '../../../form/stageEditorContext.ts';
import StageEditorShell, {
  type StageEditorShellProps,
} from '../../../form/StageEditorShell.tsx';
import BuilderSection from '../../../sections/BuilderSection.tsx';
import {
  createStageIdentity,
  ProtocolBuilderSessionStore,
} from '../../../session.ts';
import type { ProtocolBuilderResourceGateway } from '../../gateway.ts';

type RenderOptions = Readonly<{
  /** The gateway the editor's own session is opened over. */
  gateway?: ProtocolBuilderResourceGateway;
  /**
   * A session the caller has already wired to a host of its own — for a test
   * that finishes the stage rather than only editing it. The editor's own
   * session, over `gateway`, is what a test asserting on a field wants.
   */
  session?: ProtocolBuilderSessionStore;
  /** The committed stage draft the editor opens with. */
  fields?: SectionDoc;
  readOnly?: boolean;
  /** The host's action chrome; a submit button, for a test that saves. */
  actions?: StageEditorShellProps['actions'];
  children: ReactNode;
}>;

/**
 * A resource field in the editor it really lives in: the package's own form
 * shell, inside a section, over the gateway the SESSION hands the shell —
 * which is the host's gateway wrapped in the session's own staging tracker,
 * exactly as a host wires it. Nothing here reaches around the field to set its
 * value or to provide a gateway of its own, so what the tests assert on is
 * what the stage draft would be saved from, and what a field stages is staging
 * the session can promote or discard.
 */
type RenderedEditor = Readonly<{
  session: ProtocolBuilderSessionStore;
  /** Everything the stage form currently holds, by field name. */
  formValues: () => Record<string, unknown>;
  fieldValue: (name: string) => unknown;
}>;

export function renderResourceEditor({
  gateway,
  session: providedSession,
  fields = { label: 'Welcome' },
  readOnly = false,
  actions,
  children,
}: RenderOptions): RenderedEditor {
  const session = providedSession ?? defaultSession(gateway, fields, readOnly);

  const store: { current: StageFormStoreApi | undefined } = {
    current: undefined,
  };

  function CaptureStore() {
    const { storeApi } = useStageEditorForm();
    useEffect(() => {
      store.current = storeApi;
    }, [storeApi]);
    return null;
  }

  function Host() {
    const controller = useStageEditorController(session, 'stage-form');
    return (
      <StageEditorShell
        controller={controller}
        {...(actions === undefined ? {} : { actions })}
      >
        <BuilderSection title="Resources">
          <CaptureStore />
          {children}
        </BuilderSection>
      </StageEditorShell>
    );
  }

  render(
    <DialogProvider>
      <Host />
    </DialogProvider>,
  );

  const formValues = (): Record<string, unknown> =>
    store.current?.getState().getFormValues() ?? {};

  return {
    session,
    formValues,
    fieldValue: (name: string): unknown => formValues()[name],
  };
}

function defaultSession(
  gateway: ProtocolBuilderResourceGateway | undefined,
  fields: SectionDoc,
  readOnly: boolean,
): ProtocolBuilderSessionStore {
  if (gateway === undefined) {
    throw new Error('renderResourceEditor needs a gateway or a session');
  }
  return new ProtocolBuilderSessionStore({
    identity: createStageIdentity('Information', () => 'stage-1'),
    fields,
    protocolSections: {},
    manifestRevision: { sequence: 1n, hash: 'revision-1' },
    access: readOnly
      ? { mode: 'readOnly', reason: 'spectator' }
      : { mode: 'editable', leaseOwner: 'tab-1', leaseEpoch: 1n },
    resourceGateway: gateway,
    buildCandidate: ({ stageDocument }) => ({
      name: 'Resource field test',
      schemaVersion: 8,
      codebook: {},
      stages: [stageDocument],
    }),
  });
}
