import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderStageEditor } from '../../../../testing/renderStageEditor.tsx';
import { writeInto } from '../../../__tests__/writeInto.ts';
import OrdinalBinPromptsSection from '../OrdinalBinPromptsSection.tsx';

const openSection = () => ({
  stageId: 'ordinal-bin-1' as const,
  sections: <OrdinalBinPromptsSection />,
});

const prompts = (stage: Record<string, unknown>): Record<string, unknown>[] =>
  Array.isArray(stage.prompts)
    ? stage.prompts.filter(
        (row: unknown): row is Record<string, unknown> =>
          typeof row === 'object' && row !== null,
      )
    : [];

describe('the questions an ordinal bin asks', () => {
  it('opens a prompt holding the scale and the gradient it was saved with', async () => {
    const harness = renderStageEditor(openSection());

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );

    const picker = await screen.findByRole('combobox', { name: 'Attribute' });
    // Only the ordinal attributes of the type this stage sorts: the fixture
    // gives `person` one, and the rest are text, boolean, number, layout and
    // categorical.
    expect(
      [...picker.querySelectorAll('option')]
        .map((option) => option.value)
        .filter((value) => value !== ''),
    ).toEqual(['contactFreq']);
    expect(picker).toHaveValue('contactFreq');
    // `ord-color-seq-1` is the first swatch of the schema's own sequence.
    expect(screen.getByRole('radio', { name: 'Sea Green' })).toBeChecked();
  });

  /**
   * The scale is filled by dragging, and the interview checks nothing on the
   * way in: the schema declares this reference `unvalidatedAttribute`, and its
   * writer exclusivity keeps a form elsewhere from collecting the same
   * attribute. So no rules control is offered for it — Architect offers none
   * either — while the values it will draw as bins stay editable.
   */
  it('offers the scale’s values but no rules for them', async () => {
    const harness = renderStageEditor(openSection());

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    const dialog = within(await screen.findByRole('dialog'));

    expect(
      await dialog.findByRole('button', {
        name: 'Change this attribute’s values',
      }),
    ).toBeInTheDocument();
    expect(
      dialog.queryByRole('button', { name: 'Set rules for this answer' }),
    ).toBeNull();
  });

  /**
   * A researcher who never forms an opinion about the colours still writes a
   * valid prompt, as they can in Architect.
   *
   * The assertion is on what the STAGE receives, not on the checked swatch: a
   * control showing a swatch it had not written would pass a check on the
   * radio while saving a prompt with no colour at all.
   */
  it('seeds a new prompt with the first swatch, as Architect does', async () => {
    const harness = renderStageEditor(openSection());

    await harness.user.click(
      screen.getByRole('button', { name: 'Create new prompt' }),
    );
    await writeInto(
      harness,
      await screen.findByRole('textbox', { name: 'Prompt text' }),
      'How often?',
    );
    await harness.user.selectOptions(
      screen.getByRole('combobox', { name: 'Attribute' }),
      'contactFreq',
    );

    // Already chosen, so the prompt is complete without the researcher
    // touching the gradient at all.
    expect(screen.getByRole('radio', { name: 'Sea Green' })).toBeChecked();
    await harness.user.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    expect(prompts(request?.stageDocument ?? {}).at(-1)?.color).toBe(
      'ord-color-seq-1',
    );
  });

  /**
   * The gradient is still required, and a prompt that arrives without one is
   * still refused by name.
   *
   * The seed above covers prompts this editor ADDS, and nothing else: a prompt
   * the stage was already holding keeps what it was saved with, which is the
   * whole point of seeding only the added row. A protocol written before the
   * key was required — or by hand — can therefore reach this editor with no
   * gradient, and the researcher has to be told which choice is missing rather
   * than left with a dialog that will not close.
   *
   * Built rather than taken from the fixture, because the fixture protocol is
   * valid and a valid ordinal prompt has a colour.
   */
  it('refuses a prompt that arrived with no gradient, and says which one', async () => {
    const harness = renderStageEditor({
      stage: {
        id: 'ordinal-bin-legacy',
        type: 'OrdinalBin',
        fields: {
          label: 'Ordinal Bin',
          subject: { entity: 'node', type: 'person' },
          prompts: [
            {
              id: 'ordinal-bin-legacy-prompt-1',
              text: 'How often do you have contact with this person?',
              variable: 'contactFreq',
            },
          ],
        },
      },
      sections: <OrdinalBinPromptsSection />,
    });

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    // No swatch is checked, so there is a refusal to reach at all.
    await screen.findByRole('combobox', { name: 'Attribute' });
    expect(screen.getByRole('radio', { name: 'Sea Green' })).not.toBeChecked();

    await harness.user.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('Choose the gradient the bins are shaded along.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  /** A prompt with no scale has no bins, so there is nothing to order. */
  it('withholds both orderings until the scale is chosen', async () => {
    const harness = renderStageEditor(openSection());

    await harness.user.click(
      screen.getByRole('button', { name: 'Create new prompt' }),
    );
    await screen.findByRole('combobox', { name: 'Attribute' });
    expect(
      screen.getByRole('switch', {
        name: 'Bucket order',
      }),
    ).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'Bin order' })).toBeDisabled();

    await harness.user.selectOptions(
      screen.getByRole('combobox', { name: 'Attribute' }),
      'contactFreq',
    );

    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Bin order' })).toBeEnabled(),
    );
  });

  /**
   * A sort order the prompt already has opens switched on, holding its rules.
   *
   * The test above covers the direction that fails loudly. This is the quiet
   * one: a configured ordering that opened switched off would look exactly
   * like a prompt that never had one, and closing a `Section` clears the
   * fields inside it, so re-saving the prompt would drop the rules without
   * saying so.
   */
  it('opens a prompt’s sort order switched on, holding the rule it was saved with', async () => {
    const harness = renderStageEditor({
      stage: {
        type: 'OrdinalBin',
        fields: {
          label: 'Ordinal Bin',
          subject: { entity: 'node', type: 'person' },
          prompts: [
            {
              id: 'prompt-a',
              text: 'How often?',
              variable: 'contactFreq',
              color: 'ord-color-seq-1',
              bucketSortOrder: [{ property: 'name', direction: 'asc' }],
            },
          ],
        },
      },
      sections: <OrdinalBinPromptsSection />,
    });

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    await screen.findByRole('dialog');

    await waitFor(() =>
      expect(
        screen.getByRole('switch', {
          name: 'Bucket order',
        }),
      ).toBeChecked(),
    );
    expect(screen.getByRole('combobox', { name: 'Property' })).toHaveValue(
      'name',
    );
    expect(screen.getByRole('combobox', { name: 'Direction' })).toHaveValue(
      'asc',
    );
    // The ordering the prompt does NOT have stays switched off, so "already
    // configured" is what opens a group rather than "the prompt was opened".
    expect(screen.getByRole('switch', { name: 'Bin order' })).not.toBeChecked();
  });

  it('saves a gradient and a sort rule the researcher chose', async () => {
    const harness = renderStageEditor(openSection());

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    await harness.user.click(
      await screen.findByRole('radio', { name: 'Tomato' }),
    );
    await harness.user.click(screen.getByRole('switch', { name: 'Bin order' }));
    await harness.user.click(
      await screen.findByRole('button', {
        name: 'Add new bin sort rule',
      }),
    );
    await harness.user.selectOptions(
      await screen.findByRole('combobox', { name: 'Property' }),
      'age',
    );
    await harness.user.selectOptions(
      screen.getByRole('combobox', { name: 'Direction' }),
      'asc',
    );
    await harness.user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    const saved = prompts(request?.stageDocument ?? {})[0];
    expect(saved?.color).toBe('ord-color-seq-3');
    expect(saved?.binSortOrder).toEqual([
      { property: 'age', direction: 'asc' },
    ]);
    expect(saved?.id).toBe('ordinal-bin-prompt-1');
    // The rule went into the prompt, not beside it: a list inside a row dialog
    // has no document key of its own to insert against.
    expect(prompts(request?.stageDocument ?? {})).toHaveLength(1);
  });
});

/**
 * A prompt naming an attribute this interface cannot draw as bins is refused
 * rather than saved.
 *
 * The picker keeps a stored pick on offer so reopening a prompt never loses
 * it, and all it can say of one it was not given is that it is not available
 * here. This is the other half: the save that would otherwise commit it, in
 * words that say what has to change.
 *
 * Built rather than taken from the fixture, because the fixture protocol is
 * valid. A tolerant import, a hand-written protocol, or a collaborator moving
 * the attribute to another kind of answer all arrive here.
 */
describe('an ordinal bin prompt whose scale is not an ordinal attribute', () => {
  it('refuses the save, and says so under the picker', async () => {
    const harness = renderStageEditor({
      stage: {
        type: 'OrdinalBin',
        fields: {
          label: 'Ordinal Bin',
          subject: { entity: 'node', type: 'person' },
          prompts: [
            {
              id: 'prompt-a',
              text: 'How often?',
              // Categorical: its values have no order for a scale to run
              // along, so this interface cannot draw them.
              variable: 'contactType',
              color: 'ord-color-seq-1',
            },
          ],
        },
      },
      sections: <OrdinalBinPromptsSection />,
    });

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    await screen.findByRole('combobox', { name: 'Attribute' });
    await harness.user.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText(
        'The attribute whose values become the bins is no longer available on this type. Choose another one.',
      ),
    ).toBeInTheDocument();
    // The dialog stays open with the draft intact, so the refusal is where
    // the researcher can act on it rather than on a row already committed.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
