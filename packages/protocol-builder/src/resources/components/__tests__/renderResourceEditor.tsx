import { render } from '@testing-library/react';
import { useEffect, type ReactNode } from 'react';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import { useStageEditorController } from '../../../controller.ts';
import {
  useStageEditorForm,
  type StageFormStoreApi,
} from '../../../form/stageEditorContext.ts';
import StageEditorShell from '../../../form/StageEditorShell.tsx';
import BuilderSection from '../../../sections/BuilderSection.tsx';
import {
  createStageIdentity,
  ProtocolBuilderSessionStore,
} from '../../../session.ts';
import { ResourceGatewayProvider } from '../../context.tsx';
import type { ProtocolBuilderResourceGateway } from '../../gateway.ts';

type RenderOptions = Readonly<{
  gateway: ProtocolBuilderResourceGateway;
  /** The committed stage draft the editor opens with. */
  fields?: SectionDoc;
  readOnly?: boolean;
  children: ReactNode;
}>;

/**
 * A resource field in the editor it really lives in: the package's own form
 * shell, inside a section, over a gateway provided by the host. Nothing here
 * reaches around the field to set its value, so what the tests assert on is
 * what the stage draft would be saved from.
 */
type RenderedEditor = Readonly<{
  session: ProtocolBuilderSessionStore;
  /** Everything the stage form currently holds, by field name. */
  formValues: () => Record<string, unknown>;
  fieldValue: (name: string) => unknown;
}>;

export function renderResourceEditor({
  gateway,
  fields = { label: 'Welcome' },
  readOnly = false,
  children,
}: RenderOptions): RenderedEditor {
  const session = new ProtocolBuilderSessionStore({
    identity: createStageIdentity('Information', () => 'stage-1'),
    fields,
    protocolSections: {},
    manifestRevision: { sequence: 1n, hash: 'revision-1' },
    access: readOnly
      ? { mode: 'readOnly', reason: 'spectator' }
      : { mode: 'editable', leaseOwner: 'tab-1', leaseEpoch: 1n },
    buildCandidate: ({ stageDocument }) => ({
      name: 'Resource field test',
      schemaVersion: 8,
      codebook: {},
      stages: [stageDocument],
    }),
  });

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
      <StageEditorShell controller={controller}>
        <BuilderSection title="Resources">
          <CaptureStore />
          {children}
        </BuilderSection>
      </StageEditorShell>
    );
  }

  render(
    <DialogProvider>
      <ResourceGatewayProvider gateway={gateway}>
        <Host />
      </ResourceGatewayProvider>
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
