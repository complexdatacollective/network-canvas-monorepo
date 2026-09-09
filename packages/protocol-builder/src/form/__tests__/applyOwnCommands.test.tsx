import { act, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import InputField from '@codaco/fresco-ui/form/fields/InputField';
import type { Command, SectionDoc } from '@codaco/studio-sync/apply';

import BuilderSection from '../../sections/BuilderSection.tsx';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import ProtocolField from '../ProtocolField.tsx';
import {
  type OwnCommandsResult,
  useStageEditorForm,
} from '../stageEditorContext.ts';

/**
 * The seam a list editor writes through, exercised directly.
 *
 * A row operation is the only thing that reaches it in the product, but what
 * these tests are about is the seam's own rules — an empty batch is a question
 * rather than a write, and a stage somebody else holds takes neither. Going
 * through a list would make each of those a fact about that list.
 */
type ApplyOwnCommands = (commands: readonly Command[]) => OwnCommandsResult;

const NOTHING_APPLIED: OwnCommandsResult = { draft: {}, refused: false };

const initialFields: SectionDoc = {
  label: 'Welcome',
  title: 'Welcome to the study',
  items: [],
};

function renderEditor(readOnly = false) {
  const held: { apply?: ApplyOwnCommands } = {};

  function Probe() {
    held.apply = useStageEditorForm().applyOwnCommands;
    return null;
  }

  const harness = renderStageEditor({
    stage: { type: 'Information', fields: initialFields },
    ...(readOnly ? { readOnly: true } : {}),
    sections: (
      <BuilderSection title="Page content">
        <Probe />
        <ProtocolField
          name="title"
          label="Page heading"
          component={InputField}
        />
      </BuilderSection>
    ),
  });

  const seam = (): ApplyOwnCommands => {
    const { apply } = held;
    if (apply === undefined) {
      throw new Error(
        'nothing mounted the probe, so there is no seam to drive',
      );
    }
    return apply;
  };

  return {
    harness,
    apply: (commands: readonly Command[]) => {
      let answered: OwnCommandsResult = NOTHING_APPLIED;
      act(() => {
        answered = seam()(commands);
      });
      return answered;
    },
  };
}

const heading = () => screen.getByRole('textbox', { name: 'Page heading' });

describe('the form’s own structural writes', () => {
  it('refuses one while somebody else holds the stage', async () => {
    const { apply } = renderEditor(true);
    await screen.findByRole('textbox', { name: 'Page heading' });

    const answered = apply([
      { op: 'set', key: 'title', value: 'Written anyway' },
    ]);

    expect(answered.draft.title).toBe('Welcome to the study');
    // Answered with the document it already held, which is indistinguishable
    // from a write that changed nothing — so the refusal is said out loud, for
    // the row dialog whose draft depends on hearing it.
    expect(answered.refused).toBe(true);
    expect(heading()).toHaveValue('Welcome to the study');
  });

  it('says so where the researcher can read it', async () => {
    const { apply } = renderEditor(true);
    await screen.findByRole('textbox', { name: 'Page heading' });

    apply([{ op: 'set', key: 'title', value: 'Written anyway' }]);

    // Answering `refused` and saying nothing is the one that reads as the
    // editor being broken.
    expect(
      await screen.findByText(
        'This stage is read-only, so your change was not made. Somebody else is editing it.',
      ),
    ).toBeInTheDocument();
  });

  it('leaves everything typed in place when the form writes for itself', async () => {
    const { harness, apply } = renderEditor();

    const control = await screen.findByRole('textbox', {
      name: 'Page heading',
    });
    await harness.user.clear(control);
    await harness.user.type(control, 'Half-written heading');

    const answered = apply([
      {
        op: 'set',
        key: 'items',
        value: [{ id: 'a', type: 'text', content: 'Who?' }],
      },
    ]);

    // A structural write moves the document the form is holding without
    // touching the controls, so nothing on screen may be rebuilt from it.
    expect(answered.refused).toBe(false);
    await waitFor(() => expect(heading()).toHaveValue('Half-written heading'));

    // And both halves reach the protocol together on the next save.
    const written = await harness.submit();
    expect(written?.stageDocument).toMatchObject({
      title: 'Half-written heading',
      items: [{ id: 'a', type: 'text', content: 'Who?' }],
    });
  });

  it('answers a read with the document as it stands, and never refuses one', async () => {
    const { harness, apply } = renderEditor();

    const control = await screen.findByRole('textbox', {
      name: 'Page heading',
    });
    await harness.user.clear(control);
    await harness.user.type(control, 'Typed but not saved');

    // A list editor asking what the form holds right now. It writes nothing,
    // so there is nothing for the stage to refuse — and what comes back is the
    // edit in the controls, not the document the stage was opened with.
    const read = apply([]);
    expect(read.draft.title).toBe('Typed but not saved');
    expect(read.refused).toBe(false);
  });

  it('answers a read even while somebody else holds the stage', async () => {
    const { apply } = renderEditor(true);
    await screen.findByRole('textbox', { name: 'Page heading' });

    // A row dialog opened over a stage the researcher may only read still has
    // to be able to show them what is in the row.
    const read = apply([]);
    expect(read.draft.title).toBe('Welcome to the study');
    expect(read.refused).toBe(false);
    expect(screen.queryByText(/your change was not made/)).toBeNull();
  });
});
