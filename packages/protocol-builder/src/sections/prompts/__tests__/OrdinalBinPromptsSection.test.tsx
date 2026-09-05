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

    await harness.roundTrip();
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
