import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import RemoveAfterConsiderationSection from '../../RemoveAfterConsiderationSection.tsx';
import OneToManyDyadCensusPromptsSection from '../OneToManyDyadCensusPromptsSection.tsx';

const sections = (
  <>
    <RemoveAfterConsiderationSection />
    <OneToManyDyadCensusPromptsSection />
  </>
);

const openEditor = () => ({
  stageId: 'one-to-many-dyad-census-1',
  sections,
});

const prompts = (stage: Record<string, unknown>): Record<string, unknown>[] =>
  Array.isArray(stage.prompts)
    ? stage.prompts.filter(
        (row: unknown): row is Record<string, unknown> =>
          typeof row === 'object' && row !== null,
      )
    : [];

describe('the questions a one-to-many dyad census asks', () => {
  it('saves the stage it opened, unchanged', async () => {
    const harness = renderStageEditor(openEditor());

    // The stage's name and the type it asks about belong to sections this
    // mount does not include.
    await harness.roundTrip({ unowned: ['label', 'subject'] });
  });

  it('sits beside the section that says what becomes of a person', async () => {
    const harness = renderStageEditor(openEditor());

    await waitFor(() => expect(harness.outline()).toHaveLength(2));
    expect(harness.outline().map((section) => section.title)).toEqual([
      'Node availability',
      'Prompts',
    ]);
  });

  /**
   * A prompt with no connection type does not yet describe a task, so there is
   * nothing to order within it.
   */
  it('withholds both orderings until the connection type is chosen', async () => {
    const harness = renderStageEditor(openEditor());

    await harness.user.click(
      screen.getByRole('button', { name: 'Create new prompt' }),
    );
    await screen.findByRole('radio', { name: 'knows' });
    expect(
      screen.getByRole('switch', { name: 'Order of the people asked about' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('switch', {
        name: 'Order of the people to choose from',
      }),
    ).toBeDisabled();

    await harness.user.click(screen.getByRole('radio', { name: 'knows' }));

    await waitFor(() =>
      expect(
        screen.getByRole('switch', { name: 'Order of the people asked about' }),
      ).toBeEnabled(),
    );
  });

  it('saves an ordering the researcher added, and leaves the other out', async () => {
    const harness = renderStageEditor(openEditor());

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    await harness.user.click(
      await screen.findByRole('switch', {
        name: 'Order of the people asked about',
      }),
    );
    await harness.user.click(
      await screen.findByRole('button', {
        name: 'Add a rule for the order people are asked about',
      }),
    );
    await harness.user.selectOptions(
      await screen.findByRole('combobox', { name: 'Property' }),
      '*',
    );
    await harness.user.selectOptions(
      screen.getByRole('combobox', { name: 'Direction' }),
      'desc',
    );
    await harness.user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    const saved = prompts(request?.stageDocument ?? {})[0];
    expect(saved?.id).toBe('one-to-many-dyad-census-prompt-1');
    expect(saved?.bucketSortOrder).toEqual([
      { property: '*', direction: 'desc' },
    ]);
    // The ordering the researcher never opened is absent, not empty.
    expect(Object.hasOwn(saved as object, 'binSortOrder')).toBe(false);
  });
});

describe('what becomes of a person already considered', () => {
  it('offers both answers, with the stage’s own already chosen', async () => {
    renderStageEditor(openEditor());

    expect(
      screen.getByRole('radio', { name: 'Remove them from the list' }),
    ).toBeChecked();
    expect(
      screen.getByRole('radio', { name: 'Keep them in the list' }),
    ).not.toBeChecked();
  });

  it('saves the answer the researcher changed it to', async () => {
    const harness = renderStageEditor(openEditor());

    await harness.user.click(
      screen.getByRole('radio', { name: 'Keep them in the list' }),
    );

    const request = await harness.submit();
    expect(request?.stageDocument.behaviours).toEqual({
      removeAfterConsideration: false,
    });
  });
});
