import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { fixtureStageIds } from '../../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import { writeInto } from '../../__tests__/writeInto.ts';
import { tieStrengthCensusStageEditor } from '../TieStrengthCensusStageEditor.ts';

/** Where a host would insert a new one: over the stage the fixture holds. */
const TIE_STRENGTH_INDEX = fixtureStageIds().indexOf('tie-strength-census-1');

const stageNameInput = (): HTMLInputElement =>
  screen.getByRole('textbox', { name: 'Stage name' });

const prompts = (stage: Record<string, unknown>): Record<string, unknown>[] =>
  Array.isArray(stage.prompts)
    ? stage.prompts.filter(
        (row: unknown): row is Record<string, unknown> =>
          typeof row === 'object' && row !== null,
      )
    : [];

/**
 * The whole journey a researcher makes to a saveable Tie-Strength Census,
 * which is what this editor is FOR and what no section test can ask.
 *
 * The section order, the fixture round trip and the whole-schema round trip
 * are the family's, in `editors/__tests__/censusBinEditors.test.tsx`. What is
 * here is the sequence: what the participant reads, what they are asked, what
 * an answer connects, and the scale that answer is given on — each of which is
 * chosen in a different section, and one of which (the scale) can only be
 * chosen once another one has been.
 */
describe('creating a tie-strength census stage', () => {
  it('saves the new stage once every part of a rated pair is written', async () => {
    const harness = renderStageEditor({
      create: {
        type: 'TieStrengthCensus',
        position: TIE_STRENGTH_INDEX,
      },
      registry: tieStrengthCensusStageEditor,
    });

    // Proposed, and unique in the interview: the fixture already holds a stage
    // called "Tie-Strength Census", so an unqualified proposal would be a
    // second.
    await waitFor(() =>
      expect(stageNameInput()).toHaveValue('Tie-Strength Census #2'),
    );
    await harness.user.click(screen.getByRole('radio', { name: 'person' }));
    await writeInto(
      harness,
      screen.getByRole('textbox', { name: 'Title' }),
      'Pairs',
    );
    await writeInto(
      harness,
      screen.getByRole('textbox', { name: 'Introduction text' }),
      'Two at a time, on a scale.',
    );

    await harness.user.click(
      screen.getByRole('button', { name: 'Create new prompt' }),
    );
    await writeInto(
      harness,
      await screen.findByRole('textbox', { name: 'Prompt text' }),
      'How close are they?',
    );
    await harness.user.click(screen.getByRole('radio', { name: 'knows' }));
    await harness.user.selectOptions(
      await screen.findByRole('combobox', { name: 'Attribute' }),
      'closeness',
    );
    await writeInto(
      harness,
      screen.getByRole('textbox', { name: 'Decline answer' }),
      'They have never met',
    );
    await harness.user.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    expect(request?.stageDocument).toMatchObject({
      type: 'TieStrengthCensus',
      label: 'Person Tie-Strength Census',
      subject: { entity: 'node', type: 'person' },
      introductionPanel: { title: 'Pairs', text: 'Two at a time, on a scale.' },
    });
    expect(prompts(request?.stageDocument ?? {})).toEqual([
      {
        id: expect.any(String) as unknown as string,
        text: 'How close are they?',
        createEdge: 'knows',
        edgeVariable: 'closeness',
        negativeLabel: 'They have never met',
      },
    ]);
  });

  /**
   * And it refuses one that is otherwise complete, because the template does
   * not carry the task introduction this interface's schema requires.
   */
  it('refuses a new stage that has no task introduction', async () => {
    const harness = renderStageEditor({
      create: {
        type: 'TieStrengthCensus',
        position: TIE_STRENGTH_INDEX,
        fields: {
          label: 'How close',
          subject: { entity: 'node', type: 'person' },
          prompts: [
            {
              id: 'prompt-a',
              text: 'How close?',
              createEdge: 'knows',
              edgeVariable: 'closeness',
              negativeLabel: 'Not at all',
            },
          ],
        },
      },
      registry: tieStrengthCensusStageEditor,
    });

    expect(await harness.submit()).toBeNull();
  });
});
