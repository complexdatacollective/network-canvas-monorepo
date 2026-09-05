import { act, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import InputField from '@codaco/fresco-ui/form/fields/InputField';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import BuilderSection from '../../sections/BuilderSection.tsx';
import type { StageEditorProps } from '../../stage-editor-contract.ts';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import ProtocolField from '../ProtocolField.tsx';
import { useStageEditorForm } from '../stageEditorContext.ts';
import StageEditorShell from '../StageEditorShell.tsx';

const PAGE: SectionDoc = {
  label: 'Information',
  title: 'Welcome',
  items: [
    { id: 'info-item-1', type: 'text', content: 'Welcome to this interview.' },
  ],
};

type ControllerOf = ReturnType<typeof useStageEditorForm>['controller'];

let captured: ControllerOf | undefined;

function CaptureController() {
  const { controller } = useStageEditorForm();
  captured = controller;
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
        <CaptureController />
      </BuilderSection>
    </StageEditorShell>
  );
}

/**
 * An own-write record that outlives the transition it was meant to explain.
 *
 * `own()` records the draft a write produced, and the shell spends that record
 * on the next content it sees. When something else moves the draft back within
 * the same commit — a write and the undo of it, a submit and the rollback that
 * followed — the shell sees no transition at all, so the record is never spent.
 * Left standing it is spent on the next arrival at that content, which is the
 * redo: the controls keep the undone values and write them back over it.
 */
describe('a stranded own-write record', () => {
  it('re-seeds the controls when a redo restores what an own write wrote', async () => {
    const harness = renderStageEditor({
      stage: { type: 'Information', fields: PAGE },
      editor: PageEditor,
    });

    const name = await screen.findByRole('textbox', { name: 'Stage name' });
    expect(name).toHaveValue('Information');

    const controller = captured;
    if (controller === undefined) throw new Error('no controller');

    // One commit: the form writes, and something else takes the write back.
    act(() => {
      controller.setField('label', 'Renamed by the form');
      harness.session.undo();
    });
    expect(name).toHaveValue('Information');

    // The redo puts the session back on the content the record still names.
    act(() => {
      harness.session.redo();
    });

    expect(harness.session.getSnapshot().editedSection.fields.label).toBe(
      'Renamed by the form',
    );
    expect(name).toHaveValue('Renamed by the form');
  });
});
