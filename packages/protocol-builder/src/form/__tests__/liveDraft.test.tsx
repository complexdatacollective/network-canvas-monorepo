import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';

import {
  fieldsOf,
  openField,
} from '../../editors/__tests__/formEditorHarness.tsx';
import { writeInto } from '../../editors/__tests__/writeInto.ts';
import BuilderSection from '../../sections/BuilderSection.tsx';
import FormFieldsSection from '../../sections/form-fields/FormFieldsSection.tsx';
import type { StageFormDraft } from '../../stageDocument.ts';
import { useStageEdit } from '../../stageEdit.tsx';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import { useStageEditorForm } from '../stageEditorContext.ts';

/** See `formEditorHarness.tsx` for why the rich-text editor is stood in for. */
vi.mock('../../fields/RichTextField.tsx', () => ({
  default: ({
    id,
    name,
    value,
    onChange,
  }: Readonly<{
    id?: string;
    name?: string;
    value?: unknown;
    onChange?: (next: string) => void;
  }>) => (
    <input
      id={id}
      name={name}
      value={typeof value === 'string' ? value : ''}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
}));

/**
 * What the form is holding right now, for a host that renders the stage the
 * researcher is looking at rather than the one they last saved.
 *
 * Architect's preview and its draft-rescue download are both that host: they
 * are assembled outside the form, from a document that has to include the
 * keystroke just typed and the rows a list editor has just written.
 */
function renderProbe() {
  const held: { read?: () => StageFormDraft } = {};

  function Probe() {
    held.read = useStageEditorForm().liveDraft;
    return null;
  }

  renderStageEditor({
    stage: {
      type: 'Information',
      fields: { label: 'Welcome', title: 'Welcome to the study' },
    },
    sections: (
      <BuilderSection title="Page content">
        <Probe />
        <Field name="title" label="Page heading" component={InputField} />
      </BuilderSection>
    ),
  });

  return () => {
    const { read } = held;
    if (read === undefined) {
      throw new Error('nothing mounted the probe, so there is nothing to read');
    }
    return read();
  };
}

it('reads the value a control is holding before anything is saved', async () => {
  const user = userEvent.setup();
  const liveDraft = renderProbe();
  const heading = await screen.findByRole('textbox', { name: 'Page heading' });

  expect(liveDraft().title).toBe('Welcome to the study');

  await user.clear(heading);
  await user.type(heading, 'A heading nobody has saved');

  expect(liveDraft().title).toBe('A heading nobody has saved');
  // The rest of the document comes with it: a host builds a whole stage from
  // this, and a reading that carried only the registered controls would drop
  // every key no control on screen is bound to.
  expect(liveDraft().label).toBe('Welcome');
});

/**
 * The same reading Architect's stage-draft beacon takes: what the form is
 * holding now, against the document the editor opened on. The beacon composes
 * the control that offers to save unsaved work out of exactly that comparison,
 * so a draft that answers with the committed document where a section has
 * written is a draft the researcher can lose.
 *
 * A name generator's form, because it is a saved stage whose sections write
 * BENEATH a top-level key — `form.title` and `form.fields` — which is where a
 * reading assembled by field name rather than by field path stops looking.
 */
function renderFormProbe() {
  const held: { live?: () => StageFormDraft; committed?: StageFormDraft } = {};

  function Probe() {
    held.live = useStageEditorForm().liveDraft;
    held.committed = useStageEdit().committedFields;
    return null;
  }

  const harness = renderStageEditor({
    stageId: 'name-generator-1',
    sections: (
      <>
        <Probe />
        <FormFieldsSection subject="node" hasTitle />
      </>
    ),
  });

  const read = () => {
    const { live, committed } = held;
    if (live === undefined || committed === undefined) {
      throw new Error('nothing mounted the probe, so there is nothing to read');
    }
    return { draft: live(), committed };
  };

  return { harness, read };
}

it('follows a control whose name is a path into the document', async () => {
  const { harness, read } = renderFormProbe();
  const title = await screen.findByRole('textbox', { name: 'Form title' });

  expect(read().draft).toEqual(read().committed);

  await writeInto(harness, title, 'Add someone you know');

  const edited = read();
  expect(edited.draft).not.toEqual(edited.committed);

  // Undone by hand, the two agree again: the draft is a reading of the form
  // rather than a latch that anything typed sets for good.
  await writeInto(harness, title, 'Add a person');
  expect(read().draft).toEqual(read().committed);
});

it('follows a row a list section has added beneath a top-level key', async () => {
  const { harness, read } = renderFormProbe();
  await screen.findByRole('textbox', { name: 'Form title' });
  expect(fieldsOf(read().draft)).toHaveLength(1);

  const dialog = await openField(harness, 'Create new form field');
  await harness.user.selectOptions(
    dialog.getByRole('combobox', { name: 'Attribute' }),
    'relationship_to_ego',
  );
  await writeInto(
    harness,
    dialog.getByRole('textbox', { name: 'Question text' }),
    'How do you know them?',
  );
  await harness.user.click(dialog.getByRole('button', { name: 'Add' }));
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );

  const added = read();
  expect(fieldsOf(added.draft)).toHaveLength(2);
  expect(added.draft).not.toEqual(added.committed);
});
