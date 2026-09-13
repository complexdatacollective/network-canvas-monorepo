import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { getInterfaceTemplate } from '../../../interfaces/templates.ts';
import { fixtureStageIds } from '../../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import { writeInto } from '../../__tests__/writeInto.ts';
import { oneToManyDyadCensusStageEditor } from '../OneToManyDyadCensusStageEditor.ts';

/** Where a host would insert a new one: over the stage the fixture holds. */
const ONE_TO_MANY_INDEX = fixtureStageIds().indexOf(
  'one-to-many-dyad-census-1',
);

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
 * The one interface of the three with a template that carries something.
 *
 * The section order, the fixture round trip and the whole-schema round trip
 * are the family's, in `editors/__tests__/censusBinEditors.test.tsx`. What is
 * here is what only this editor can be asked: the default it opens a new stage
 * on, and that a stage with no introduction screen still saves — which is the
 * whole of how this census differs from the two pairwise ones.
 */
describe('creating a one-to-many dyad census stage', () => {
  it('opens a new stage on the answer its template carries', async () => {
    renderStageEditor({
      create: {
        type: 'OneToManyDyadCensus',
        position: ONE_TO_MANY_INDEX,
      },
      registry: oneToManyDyadCensusStageEditor,
    });

    await waitFor(() =>
      expect(stageNameInput()).toHaveValue('One to Many Dyad Census #2'),
    );
    // The template's answer, on screen as the answer rather than as an
    // unanswered question: the schema requires one either way.
    expect(getInterfaceTemplate('OneToManyDyadCensus')).toEqual({
      behaviours: { removeAfterConsideration: true },
    });
    expect(
      screen.getByRole('radio', { name: 'Remove them from the list' }),
    ).toBeChecked();
    // And no introduction screen: this census shows the whole network from the
    // first question, so its schema has nowhere to put one.
    expect(
      screen.queryByRole('textbox', { name: 'Title' }),
    ).not.toBeInTheDocument();
  });

  it('saves the new stage once it has been given a type and a question', async () => {
    const harness = renderStageEditor({
      create: {
        type: 'OneToManyDyadCensus',
        position: ONE_TO_MANY_INDEX,
      },
      registry: oneToManyDyadCensusStageEditor,
    });

    await waitFor(() =>
      expect(stageNameInput()).toHaveValue('One to Many Dyad Census #2'),
    );
    await harness.user.click(screen.getByRole('radio', { name: 'person' }));
    // A first choice of type costs the stage what it is already carrying, and
    // this is the one census whose template carries something — so the picker
    // asks before it moves, and the researcher has to answer.
    await harness.user.click(
      await screen.findByRole('button', { name: 'Choose the node type' }),
    );
    // The prompts wait on the type they describe, so the control that adds one
    // arrives only once the stage has been told what it works with.
    await harness.user.click(
      await screen.findByRole('button', { name: 'Create new prompt' }),
    );
    await writeInto(
      harness,
      await screen.findByRole('textbox', { name: 'Prompt text' }),
      'Who does this person know?',
    );
    await harness.user.click(screen.getByRole('radio', { name: 'knows' }));
    await harness.user.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    await harness.user.click(
      screen.getByRole('radio', { name: 'Keep them in the list' }),
    );

    const request = await harness.submit();
    expect(request?.stageDocument).toMatchObject({
      type: 'OneToManyDyadCensus',
      label: 'Person One to Many Dyad Census',
      subject: { entity: 'node', type: 'person' },
      behaviours: { removeAfterConsideration: false },
    });
    expect(prompts(request?.stageDocument ?? {})).toEqual([
      {
        id: expect.any(String) as unknown as string,
        text: 'Who does this person know?',
        createEdge: 'knows',
      },
    ]);
  });
});
