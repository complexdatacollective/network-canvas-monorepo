import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  attributeField,
  chooseAttributeById,
} from '../../../testing/attributePicker.ts';
import { fixtureStageIds } from '../../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import { writeInto } from '../../__tests__/writeInto.ts';
import { categoricalBinStageEditor } from '../CategoricalBinStageEditor.ts';

/** Where a host would insert a new one: over the stage the fixture holds. */
const CATEGORICAL_BIN_INDEX = fixtureStageIds().indexOf('categorical-bin-1');

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
 * The whole journey a researcher makes to a saveable Categorical Bin, which is
 * what this editor is FOR and what no section test can ask.
 *
 * The section order and the two round trips are the family's, in
 * `editors/__tests__/censusBinEditors.test.tsx`. What is here is the sequence,
 * and the one thing about it that is this interface's alone: the bin for
 * everything else is three answers that the schema takes together or not at
 * all, and they are only reachable once the bins themselves are chosen.
 */
describe('creating a categorical bin stage', () => {
  it('saves the new stage once its prompt names the bins', async () => {
    const harness = renderStageEditor({
      create: { type: 'CategoricalBin', position: CATEGORICAL_BIN_INDEX },
      registry: categoricalBinStageEditor,
    });

    // Proposed, and unique in the interview: the fixture already holds a stage
    // called "Categorical Bin", so an unqualified proposal would be a second.
    await waitFor(() =>
      expect(stageNameInput()).toHaveValue('Categorical Bin #2'),
    );
    await harness.user.click(screen.getByRole('radio', { name: 'person' }));

    await harness.user.click(
      screen.getByRole('button', { name: 'Create new prompt' }),
    );
    await writeInto(
      harness,
      await screen.findByRole('textbox', { name: 'Prompt text' }),
      'What kind of contact?',
    );
    await screen.findByText('Attribute', { selector: 'label' });
    await chooseAttributeById(
      harness.user,
      attributeField('Attribute'),
      'contactType',
    );
    await harness.user.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    expect(request?.stageDocument).toMatchObject({
      type: 'CategoricalBin',
      label: 'Person Categorical Bin',
      subject: { entity: 'node', type: 'person' },
    });
    expect(prompts(request?.stageDocument ?? {})).toEqual([
      {
        id: expect.any(String) as unknown as string,
        text: 'What kind of contact?',
        variable: 'contactType',
      },
    ]);
  });

  /**
   * And the bin for everything else, written in the same visit.
   *
   * All three of its answers reach the prompt together, because the schema
   * refuses half of them: a follow-up attribute with no label and no question
   * would be a bin the participant can reach and then not be asked anything
   * in.
   */
  it('saves a prompt whose bin for everything else is filled in', async () => {
    const harness = renderStageEditor({
      stageId: 'categorical-bin-1',
      registry: categoricalBinStageEditor,
    });

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    await screen.findByRole('dialog');
    await harness.user.click(
      screen.getByRole('switch', { name: 'A bin for anything else' }),
    );

    const groupElement = await screen.findByRole('region', {
      name: 'A bin for anything else',
    });
    const group = within(groupElement);
    // Scoped to the group, because the prompt picks two attributes and both
    // fields are in the same dialog.
    await group.findByText('Attribute the answer is stored in', {
      selector: 'label',
    });
    await chooseAttributeById(
      harness.user,
      attributeField('Attribute the answer is stored in', groupElement),
      'relationship_to_ego',
    );
    await writeInto(
      harness,
      group.getByRole('textbox', { name: 'Bin label' }),
      'Something else',
    );
    await writeInto(
      harness,
      group.getByRole('textbox', { name: 'Follow-up question' }),
      'What kind of contact is it?',
    );

    await harness.user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    expect(prompts(request?.stageDocument ?? {})).toEqual([
      {
        id: 'categorical-bin-prompt-1',
        text: 'What type of contact do you have most with this person?',
        variable: 'contactType',
        otherVariable: 'relationship_to_ego',
        otherOptionLabel: 'Something else',
        otherVariablePrompt: 'What kind of contact is it?',
      },
    ]);
  });
});
