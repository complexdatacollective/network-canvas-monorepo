import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import FieldNamespace from '@codaco/fresco-ui/form/FieldNamespace';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import { useStageEditorController } from '../../controller.ts';
import BuilderSection from '../../sections/BuilderSection.tsx';
import {
  createStageIdentity,
  ProtocolBuilderSessionStore,
} from '../../session.ts';
import ProtocolField from '../ProtocolField.tsx';
import StageEditorShell from '../StageEditorShell.tsx';

function createSession(fields: SectionDoc) {
  return new ProtocolBuilderSessionStore({
    identity: createStageIdentity('Information', () => 'stage-1'),
    fields,
    protocolSections: {},
    manifestRevision: { sequence: 1n, hash: 'revision-1' },
    access: { mode: 'editable', leaseOwner: 'tab-1', leaseEpoch: 1n },
    buildCandidate: ({ stageDocument }) => ({
      name: 'Protocol field test',
      schemaVersion: 8,
      codebook: {},
      stages: [stageDocument],
    }),
  });
}

function renderField(
  session: ProtocolBuilderSessionStore,
  children: React.ReactNode,
) {
  function Host() {
    const controller = useStageEditorController(session, 'stage-form');
    return (
      <StageEditorShell controller={controller}>
        <BuilderSection title="Introduction">{children}</BuilderSection>
      </StageEditorShell>
    );
  }

  return render(
    <DialogProvider>
      <Host />
    </DialogProvider>,
  );
}

describe('ProtocolField', () => {
  it('seeds a field from the path it is really registered under', async () => {
    renderField(
      createSession({
        label: 'Welcome',
        introductionPanel: { title: 'Before we start' },
      }),
      <FieldNamespace prefix="introductionPanel">
        <ProtocolField
          name="title"
          label="Panel title"
          component={InputField}
        />
      </FieldNamespace>,
    );

    // The namespace is part of where this field lives. Reading the committed
    // draft from the root instead would start the control blank and then save
    // that blank over what the author wrote.
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Panel title' })).toHaveValue(
        'Before we start',
      ),
    );
  });

  it('treats an opaque name as one key rather than a route', async () => {
    renderField(
      createSession({
        label: 'Welcome',
        // A protocol-authored variable id, which may contain a dot and is not
        // a path into anything.
        attributes: { 'person.age': 'seeded' },
      }),
      <FieldNamespace prefix="attributes">
        <ProtocolField
          name="person.age"
          nameMode="opaque"
          label="Age"
          component={InputField}
        />
      </FieldNamespace>,
    );

    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Age' })).toHaveValue(
        'seeded',
      ),
    );
  });
});
