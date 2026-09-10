import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';

import BuilderSection from '../../sections/BuilderSection.tsx';
import type { StageFormDraft } from '../../stageDocument.ts';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import { useStageEditorForm } from '../stageEditorContext.ts';

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
