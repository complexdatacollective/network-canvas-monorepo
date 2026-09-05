import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import OrdinalBinPromptsSection from '../OrdinalBinPromptsSection.tsx';

const openEditor = () => ({
  stageId: 'ordinal-bin-1',
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
  it('saves the stage it opened, unchanged', async () => {
    const harness = renderStageEditor(openEditor());

    // The stage's name and the type its bins sort belong to sections this
    // mount does not include.
    await harness.roundTrip({ unowned: ['label', 'subject'] });
  });

  it('opens a prompt holding the scale and the gradient it was saved with', async () => {
    const harness = renderStageEditor(openEditor());

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );

    const picker = await screen.findByRole('combobox', { name: 'Attribute' });
    expect(
      [...picker.querySelectorAll('option')]
        .map((option) => option.value)
        .filter((value) => value !== ''),
    ).toEqual(['contactFreq']);
    expect(picker).toHaveValue('contactFreq');
    // `ord-color-seq-1` is the first swatch in the schema's own sequence.
    expect(screen.getByRole('radio', { name: 'Sea Green' })).toBeChecked();
  });

  /**
   * SKIPPED until S's `itemTemplate` passthrough lands on `PromptsSection`
   * (branch `feat/protocol-builder-editor-sections`; `DialogArrayField`
   * already accepts `itemTemplate`, `PromptsSection` does not forward it).
   * The `TODO(S itemTemplate)` in `OrdinalBinPromptsSection.tsx` names the
   * template to pass.
   *
   * Architect seeds a new ordinal prompt with the first swatch of the schema's
   * sequence, so a researcher who never looks at the gradient still writes a
   * valid prompt. Unskipping this REPLACES the refusal tested below: once the
   * gradient is seeded there is no prompt with no gradient to refuse.
   */
  it.skip('seeds a new prompt with the first swatch, as Architect does', async () => {
    const harness = renderStageEditor(openEditor());

    await harness.user.click(
      screen.getByRole('button', { name: 'Create new prompt' }),
    );
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Prompt text' }),
      'How often do you talk?',
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

  it('refuses a prompt with no gradient, and says which one', async () => {
    const harness = renderStageEditor(openEditor());

    await harness.user.click(
      screen.getByRole('button', { name: 'Create new prompt' }),
    );
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Prompt text' }),
      'How often do you talk?',
    );
    await harness.user.selectOptions(
      screen.getByRole('combobox', { name: 'Attribute' }),
      'contactFreq',
    );
    await harness.user.click(screen.getByRole('button', { name: 'Add' }));

    expect(
      await screen.findByText('Choose the gradient the bins are shaded along.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  /**
   * A prompt with no scale has nothing to order within, so the two orderings
   * cannot be set until the attribute is chosen.
   */
  it('withholds both orderings until the scale is chosen', async () => {
    const harness = renderStageEditor(openEditor());

    await harness.user.click(
      screen.getByRole('button', { name: 'Create new prompt' }),
    );
    await screen.findByRole('combobox', { name: 'Attribute' });
    expect(
      screen.getByRole('switch', {
        name: 'Order people are handed to the participant in',
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole('switch', { name: 'Order within each bin' }),
    ).toBeDisabled();

    await harness.user.selectOptions(
      screen.getByRole('combobox', { name: 'Attribute' }),
      'contactFreq',
    );

    await waitFor(() =>
      expect(
        screen.getByRole('switch', { name: 'Order within each bin' }),
      ).toBeEnabled(),
    );
  });

  /**
   * A sort order the prompt already has opens switched on, holding its rules.
   *
   * The test above covers the direction that fails loudly — a group that
   * cannot be switched on until the scale is chosen. This is the quiet one: a
   * configured ordering that opened switched off would look exactly like a
   * prompt that never had one, and closing a `Section` clears the fields
   * inside it, so re-saving the prompt would drop the rules without saying so.
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
          name: 'Order people are handed to the participant in',
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
    expect(
      screen.getByRole('switch', { name: 'Order within each bin' }),
    ).not.toBeChecked();
  });

  it('saves a gradient and a sort rule the researcher chose', async () => {
    const harness = renderStageEditor(openEditor());

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    await harness.user.click(
      await screen.findByRole('radio', { name: 'Tomato' }),
    );
    await harness.user.click(
      screen.getByRole('switch', { name: 'Order within each bin' }),
    );
    await harness.user.click(
      await screen.findByRole('button', {
        name: 'Add a rule for the order within a bin',
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
    // The rule went into the prompt, not beside it: a list inside a row
    // dialog has no document key of its own to insert against.
    expect(prompts(request?.stageDocument ?? {})).toHaveLength(1);
  });
});

describe('a codebook that changes while an ordinal prompt is open', () => {
  it('offers an attribute a collaborator added, without echoing a command', async () => {
    const harness = renderStageEditor(openEditor());
    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    await screen.findByRole('combobox', { name: 'Attribute' });
    const dispatch = vi.spyOn(harness.session, 'dispatch');

    const person = personDocument(harness);
    harness.receiveCodebookUpdate({
      node: {
        person: {
          ...person,
          variables: {
            ...personVariables(harness),
            closenessToEgo: {
              name: 'closenessToEgo',
              type: 'ordinal',
              options: [
                { label: 'Distant', value: 1 },
                { label: 'Close', value: 2 },
              ],
            },
          },
        },
      },
    });

    expect(
      await screen.findByRole('option', { name: 'closenessToEgo' }),
    ).toBeInTheDocument();
    expect(dispatch).not.toHaveBeenCalled();
    expect(harness.pendingCommands()).toEqual([]);
    // And the researcher's own pick is untouched by someone else's addition.
    expect(screen.getByRole('combobox', { name: 'Attribute' })).toHaveValue(
      'contactFreq',
    );
  });
});

function personDocument(harness: {
  session: { getSnapshot(): { protocolSections: Record<string, unknown> } };
}): Record<string, unknown> {
  const document =
    harness.session.getSnapshot().protocolSections['codebook:node:person'];
  if (typeof document !== 'object' || document === null) {
    throw new Error('the fixture has no person type');
  }
  return { ...document };
}

function personVariables(harness: {
  session: { getSnapshot(): { protocolSections: Record<string, unknown> } };
}): Record<string, unknown> {
  const variables = personDocument(harness).variables;
  if (typeof variables !== 'object' || variables === null) {
    throw new Error('the fixture’s person type has no attributes');
  }
  return { ...variables };
}
