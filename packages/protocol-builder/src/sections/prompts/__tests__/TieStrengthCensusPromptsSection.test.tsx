import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  renderStageEditor,
  type StageEditorHarness,
} from '../../../testing/renderStageEditor.tsx';
import TieStrengthCensusPromptsSection from '../TieStrengthCensusPromptsSection.tsx';

const openEditor = () => ({
  stageId: 'tie-strength-census-1',
  sections: <TieStrengthCensusPromptsSection />,
});

const prompts = (stage: Record<string, unknown>): Record<string, unknown>[] =>
  Array.isArray(stage.prompts)
    ? stage.prompts.filter(
        (row: unknown): row is Record<string, unknown> =>
          typeof row === 'object' && row !== null,
      )
    : [];

describe('the questions a tie-strength census asks about a pair', () => {
  it('saves the stage it opened, unchanged', async () => {
    const harness = renderStageEditor(openEditor());

    // The stage's name, the type it asks about and the screen shown before
    // it belong to sections this mount does not include.
    await harness.roundTrip({
      unowned: ['label', 'subject', 'introductionPanel'],
    });
  });

  it('opens a prompt holding everything it was saved with', async () => {
    const harness = renderStageEditor(openEditor());

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );

    expect(await screen.findByRole('radio', { name: 'knows' })).toBeChecked();
    // The scale is the CONNECTION's attribute, not the person's.
    const picker = screen.getByRole('combobox', { name: 'Attribute' });
    expect(
      [...picker.querySelectorAll('option')]
        .map((option) => option.value)
        .filter((value) => value !== ''),
    ).toEqual(['closeness']);
    expect(picker).toHaveValue('closeness');
    expect(
      screen.getByRole('textbox', { name: 'Decline answer' }),
    ).toHaveTextContent("Don't know each other");
  });

  /**
   * The scale belongs to the connection, so there is nothing to choose from
   * until the connection type is known.
   */
  it('offers no scale until the connection type is chosen', async () => {
    const harness = renderStageEditor(openEditor());

    await harness.user.click(
      screen.getByRole('button', { name: 'Create new prompt' }),
    );
    await screen.findByRole('radio', { name: 'knows' });
    expect(
      screen.queryByRole('combobox', { name: 'Attribute' }),
    ).not.toBeInTheDocument();

    await harness.user.click(
      screen.getByRole('radio', { name: 'family_edge' }),
    );

    // And it offers that connection type's own ordinal attributes; a
    // `family_edge` has none, so the picker says so rather than offering the
    // person's.
    expect(
      await screen.findByText(
        'This connection type has no ordinal attributes yet. Create one to say what the scale is.',
      ),
    ).toBeInTheDocument();
  });

  it('refuses a prompt with no way to decline, and says which one', async () => {
    const harness = renderStageEditor(openEditor());

    await harness.user.click(
      screen.getByRole('button', { name: 'Create new prompt' }),
    );
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Prompt text' }),
      'How much do these two trust each other?',
    );
    await harness.user.click(screen.getByRole('radio', { name: 'knows' }));
    await harness.user.selectOptions(
      await screen.findByRole('combobox', { name: 'Attribute' }),
      'closeness',
    );
    await harness.user.click(screen.getByRole('button', { name: 'Add' }));

    expect(
      await screen.findByText(
        'Write how the participant says there is no connection.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('saves a whole new prompt with its own identity', async () => {
    const harness = renderStageEditor(openEditor());

    await harness.user.click(
      screen.getByRole('button', { name: 'Create new prompt' }),
    );
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Prompt text' }),
      'How much do these two trust each other?',
    );
    await harness.user.click(screen.getByRole('radio', { name: 'knows' }));
    await harness.user.selectOptions(
      await screen.findByRole('combobox', { name: 'Attribute' }),
      'closeness',
    );
    await harness.user.type(
      screen.getByRole('textbox', { name: 'Decline answer' }),
      'Not at all',
    );
    await harness.user.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    const rows = prompts(request?.stageDocument ?? {});
    expect(rows).toHaveLength(2);
    expect(rows[0]?.id).toBe('tie-strength-census-prompt-1');
    expect(rows[1]).toEqual({
      id: expect.any(String) as unknown as string,
      text: 'How much do these two trust each other?',
      createEdge: 'knows',
      edgeVariable: 'closeness',
      negativeLabel: 'Not at all',
    });
  });

  it('discards an edit the researcher cancelled', async () => {
    const harness = renderStageEditor(openEditor());

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    const decline = await screen.findByRole('textbox', {
      name: 'Decline answer',
    });
    await harness.user.clear(decline);
    await harness.user.type(decline, 'Never met');
    await harness.user.click(screen.getByRole('button', { name: 'Cancel' }));
    await harness.user.click(
      await screen.findByRole('button', { name: 'Discard changes' }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    await harness.roundTrip({
      unowned: ['label', 'subject', 'introductionPanel'],
    });
  });
});

/**
 * Both of this prompt's codebook writes are compound edits against the
 * codebook alone: the connection type, and then the scale that belongs to it.
 */
describe('creating a scale from inside a tie-strength prompt', () => {
  it('asks the host once, and points the prompt at what it created', async () => {
    const harness = renderStageEditor(openEditor());
    const submit = vi.spyOn(harness.host, 'submit');

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Create a new attribute' }),
    );
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Attribute name' }),
      'trust',
    );
    await addOption(harness, 1, 'A little', 1);
    await addOption(harness, 2, 'A lot', 2);
    await harness.user.click(
      screen.getByRole('button', { name: 'Create attribute' }),
    );

    const picker = await screen.findByRole('combobox', { name: 'Attribute' });
    await waitFor(() =>
      expect(
        within(picker).getByRole('option', { name: 'trust' }),
      ).toBeInTheDocument(),
    );

    expect(submit).toHaveBeenCalledTimes(1);
    const submission = submit.mock.calls[0]?.[0];
    expect(submission?.edits).toHaveLength(1);
    const edit = submission?.edits[0];
    expect(edit?.kind).toBe('update');
    // The connection type's own section, not the stage's and not the
    // person's: the scale hangs off the edge the prompt creates.
    expect(edit?.sectionId).toBe('codebook:edge:knows');
    expect(submit.mock.results[0]?.value).toMatchObject({ status: 'applied' });

    await harness.user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    const saved = prompts(request?.stageDocument ?? {})[0];
    expect(saved?.edgeVariable).toEqual(expect.any(String));
    expect(saved?.edgeVariable).not.toBe('closeness');
    expect(saved?.createEdge).toBe('knows');
  });
});

describe('a codebook that changes while a tie-strength prompt is open', () => {
  it('follows an attribute a collaborator deleted, without echoing a command', async () => {
    const harness = renderStageEditor(openEditor());
    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    await screen.findByRole('combobox', { name: 'Attribute' });
    const dispatch = vi.spyOn(harness.session, 'dispatch');

    harness.receiveCodebookUpdate({
      edge: {
        knows: { name: 'knows', color: 'edge-color-seq-1', variables: {} },
      },
    });

    expect(
      await screen.findByText(
        'This attribute is no longer in the codebook. Choose another one.',
      ),
    ).toBeInTheDocument();
    expect(dispatch).not.toHaveBeenCalled();
    expect(harness.pendingCommands()).toEqual([]);
  });
});

/** Adds one option to the attribute editor that is open. */
async function addOption(
  harness: StageEditorHarness,
  position: number,
  label: string,
  value: number,
) {
  await harness.user.click(screen.getByRole('button', { name: 'Add option' }));
  await harness.user.type(
    await screen.findByRole('textbox', { name: `Option ${position} label` }),
    label,
  );
  const valueField = screen.getByRole('textbox', {
    name: `Option ${position} value`,
  });
  await harness.user.clear(valueField);
  await harness.user.type(valueField, String(value));
}
