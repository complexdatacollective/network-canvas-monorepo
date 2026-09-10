import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderStageEditor } from '../../../../testing/renderStageEditor.tsx';
import { writeInto } from '../../../__tests__/writeInto.ts';
import OneToManyDyadCensusPromptsSection from '../OneToManyDyadCensusPromptsSection.tsx';

const openSection = () => ({
  stageId: 'one-to-many-dyad-census-1' as const,
  sections: <OneToManyDyadCensusPromptsSection />,
});

const prompts = (stage: Record<string, unknown>): Record<string, unknown>[] =>
  Array.isArray(stage.prompts)
    ? stage.prompts.filter(
        (row: unknown): row is Record<string, unknown> =>
          typeof row === 'object' && row !== null,
      )
    : [];

const ASKED_ORDER = 'Order of the people asked about';
const CHOICE_ORDER = 'Order of the people to choose from';

describe('the questions a one-to-many dyad census asks', () => {
  it('saves the stage it opened, unchanged', async () => {
    const harness = renderStageEditor(openSection());

    // The stage's name, the type it asks about and what becomes of a person
    // already considered belong to sections this mount does not include.
    await harness.roundTrip({
      unowned: ['label', 'subject', 'behaviours'],
    });
  });

  /**
   * Both orders describe a task the prompt does not yet have: until the
   * connection type is chosen there is nothing being recorded, so there is
   * nothing to order the people for. Architect waits on the same choice.
   */
  it('holds both orders shut until the connection type is chosen', async () => {
    const harness = renderStageEditor(openSection());

    await harness.user.click(
      screen.getByRole('button', { name: 'Create new prompt' }),
    );
    await screen.findByRole('radio', { name: 'knows' });
    expect(screen.getByRole('switch', { name: ASKED_ORDER })).toBeDisabled();
    expect(screen.getByRole('switch', { name: CHOICE_ORDER })).toBeDisabled();

    await harness.user.click(screen.getByRole('radio', { name: 'knows' }));

    await waitFor(() =>
      expect(
        screen.getByRole('switch', { name: ASKED_ORDER }),
      ).not.toBeDisabled(),
    );
    expect(
      screen.getByRole('switch', { name: CHOICE_ORDER }),
    ).not.toBeDisabled();
  });

  /**
   * A sort rule READS an attribute rather than writing it, so it sits outside
   * the writer-exclusivity rule entirely: a census may legitimately be ordered
   * by an attribute a form elsewhere collects, and filtering those out would
   * drop a rule an imported protocol already has.
   */
  it('orders the people by any attribute the node type has', async () => {
    const harness = renderStageEditor(openSection());

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    await harness.user.click(
      await screen.findByRole('switch', { name: ASKED_ORDER }),
    );
    const group = await screen.findByRole('region', { name: ASKED_ORDER });
    await harness.user.click(
      within(group).getByRole('button', {
        name: 'Add a rule for the order people are asked about',
      }),
    );

    const property = within(group).getByRole('combobox', { name: 'Property' });
    const offered = [...property.querySelectorAll('option')].map(
      (option) => option.value,
    );
    // The wildcard the interview supplies, plus the person's own attributes —
    // including `name`, which the stage's form collects and validates.
    expect(offered).toContain('*');
    expect(offered).toContain('name');
  });

  it('saves the two orders a researcher wrote, and nothing else', async () => {
    const harness = renderStageEditor(openSection());

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    await harness.user.click(
      await screen.findByRole('switch', { name: ASKED_ORDER }),
    );
    const asked = await screen.findByRole('region', { name: ASKED_ORDER });
    await harness.user.click(
      within(asked).getByRole('button', {
        name: 'Add a rule for the order people are asked about',
      }),
    );
    await harness.user.selectOptions(
      within(asked).getByRole('combobox', { name: 'Property' }),
      'name',
    );
    await harness.user.selectOptions(
      within(asked).getByRole('combobox', { name: 'Direction' }),
      'asc',
    );
    await harness.user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    const saved = prompts(request?.stageDocument ?? {})[0];
    expect(saved?.bucketSortOrder).toEqual([
      { property: 'name', direction: 'asc' },
    ]);
    // The order the researcher never opened carries no key at all, rather than
    // an empty list saying what its absence already says.
    expect(saved).not.toHaveProperty('binSortOrder');
  });

  /**
   * Switching an order back off is how a researcher says this prompt orders
   * nobody in particular, and the key has to leave the prompt for the schema
   * to read it that way.
   */
  it('drops an order the researcher switched back off', async () => {
    const harness = renderStageEditor({
      stage: {
        type: 'OneToManyDyadCensus',
        fields: {
          label: 'One to Many Dyad Census',
          subject: { entity: 'node', type: 'person' },
          behaviours: { removeAfterConsideration: true },
          prompts: [
            {
              id: 'prompt-a',
              text: 'Who does this person know?',
              createEdge: 'knows',
              bucketSortOrder: [{ property: 'name', direction: 'asc' }],
            },
          ],
        },
      },
      sections: <OneToManyDyadCensusPromptsSection />,
    });

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    await harness.user.click(
      await screen.findByRole('switch', { name: ASKED_ORDER }),
    );
    await harness.user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    const saved = prompts(request?.stageDocument ?? {})[0];
    expect(saved).not.toHaveProperty('bucketSortOrder');
    expect(saved?.createEdge).toBe('knows');
  });

  it('refuses a prompt that creates no connection, and says which one', async () => {
    const harness = renderStageEditor(openSection());

    await harness.user.click(
      screen.getByRole('button', { name: 'Create new prompt' }),
    );
    await writeInto(
      harness,
      await screen.findByRole('textbox', { name: 'Prompt text' }),
      'Who do they know?',
    );
    await harness.user.click(screen.getByRole('button', { name: 'Add' }));

    expect(
      await screen.findByText(
        'Choose the type of connection an affirmative answer creates.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
