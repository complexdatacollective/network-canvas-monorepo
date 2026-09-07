import { act, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import InputField from '@codaco/fresco-ui/form/fields/InputField';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import BuilderSection from '../../sections/BuilderSection.tsx';
import type { StageEditorProps } from '../../stage-editor-contract.ts';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import ProtocolField from '../ProtocolField.tsx';
import {
  useStageEditorForm,
  type StageEditorFormContextValue,
} from '../stageEditorContext.ts';
import StageEditorShell from '../StageEditorShell.tsx';

const PAGE: SectionDoc = {
  label: 'Information',
  title: 'Welcome',
  items: [
    { id: 'info-item-1', type: 'text', content: 'Welcome to this interview.' },
  ],
};

type ApplyOwnCommands = StageEditorFormContextValue['applyOwnCommands'];

let captured: ApplyOwnCommands | undefined;

function CaptureOwnWrites() {
  const { applyOwnCommands } = useStageEditorForm();
  captured = applyOwnCommands;
  return null;
}

function PageEditor({ controller }: StageEditorProps<'Information'>) {
  return (
    <StageEditorShell
      controller={controller}
      actions={({ formId }) => (
        <SubmitButton form={formId}>Save stage</SubmitButton>
      )}
    >
      <BuilderSection title="Page content">
        <ProtocolField<typeof InputField>
          name="label"
          label="Stage name"
          component={InputField}
        />
        <CaptureOwnWrites />
      </BuilderSection>
    </StageEditorShell>
  );
}

/**
 * An own-write marker that outlives the transition it was meant to explain.
 *
 * A structural write marks the draft it produced, and the shell spends that
 * marker on the next transition it sees. When something else moves the draft
 * back within the same commit — a write and the undo of it, a submit and the
 * rollback that followed — the shell sees no transition at all, so the marker
 * is never spent. Left standing it is spent on the next arrival at that
 * content, which is the redo: the controls keep the undone values and write
 * them back over it.
 */
describe('a stranded own-write marker', () => {
  it('re-seeds the controls when a redo restores what an own write wrote', async () => {
    const harness = renderStageEditor({
      stage: { type: 'Information', fields: PAGE },
      editor: PageEditor,
    });

    const name = await screen.findByRole('textbox', { name: 'Stage name' });
    expect(name).toHaveValue('Information');

    const applyOwnCommands = captured;
    if (applyOwnCommands === undefined) {
      throw new Error('no applyOwnCommands');
    }

    // One commit: the form writes, and something else takes the write back.
    act(() => {
      applyOwnCommands([
        { op: 'set', key: 'label', value: 'Renamed by the form' },
      ]);
      harness.session.undo();
    });
    expect(name).toHaveValue('Information');

    // The redo puts the session back on the content the marker still names.
    act(() => {
      harness.session.redo();
    });

    expect(harness.session.getSnapshot().editedSection.fields.label).toBe(
      'Renamed by the form',
    );
    expect(name).toHaveValue('Renamed by the form');
  });
});
