import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { fixtureStageIds } from '../../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import { writeInto } from '../../__tests__/writeInto.ts';
import {
  addInterviewNetworkPanel,
  chooseNodeType,
} from '../../name-generator/__tests__/addSidePanel.ts';
import { nameGeneratorQuickAddStageEditor } from '../NameGeneratorQuickAddStageEditor.ts';

/** Where a host would insert a new one: over the stage the fixture holds. */
const QUICK_ADD_INDEX = fixtureStageIds().indexOf('name-generator-quick-add-1');

const stageNameInput = (): HTMLElement =>
  screen.getByRole('textbox', { name: 'Stage name' });

/**
 * The whole journey a researcher makes to a saveable quick-add generator,
 * which is what this editor is FOR and what no section test can ask.
 *
 * The section order, the fixture round trip and the whole-schema round trip
 * are the family's, in `editors/__tests__/censusBinEditors.test.tsx`. What is
 * here is the sequence: the type this stage adds, the one attribute the
 * participant fills in — only choosable once the type has been — and the
 * question that asks for it.
 */
describe('creating a quick-add name generator', () => {
  it('saves the new stage once it has an attribute to fill in and a question to ask', async () => {
    const harness = renderStageEditor({
      create: { type: 'NameGeneratorQuickAdd', position: QUICK_ADD_INDEX },
      registry: nameGeneratorQuickAddStageEditor,
    });

    await waitFor(() =>
      expect(stageNameInput()).toHaveValue('Quick Add Name Generator'),
    );
    // The attribute cannot be chosen before the type whose attributes it comes
    // from.
    expect(
      screen.getByText('Select a node type above to configure this section.'),
    ).toBeInTheDocument();

    await harness.user.click(screen.getByRole('radio', { name: 'person' }));
    await harness.user.selectOptions(
      await screen.findByRole('combobox', { name: 'Select an attribute' }),
      'name',
    );

    await harness.user.click(
      screen.getByRole('button', { name: 'Create new prompt' }),
    );
    await writeInto(
      harness,
      await screen.findByRole('textbox', { name: 'Prompt text' }),
      'Who are the people you know?',
    );
    await harness.user.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    expect(request?.stageDocument).toMatchObject({
      type: 'NameGeneratorQuickAdd',
      subject: { entity: 'node', type: 'person' },
      quickAdd: 'name',
    });
    expect(request?.stageDocument.prompts).toEqual([
      {
        id: expect.any(String) as unknown as string,
        text: 'Who are the people you know?',
      },
    ]);
  });

  /**
   * The heading is qualified by the side panels, exactly as the form-based
   * generator's is: a generator offering the people named so far is a
   * different stage from one that offers nothing.
   */
  it('proposes a name that says what the stage offers beside its question', async () => {
    const harness = renderStageEditor({
      create: { type: 'NameGeneratorQuickAdd', position: QUICK_ADD_INDEX },
      registry: nameGeneratorQuickAddStageEditor,
    });

    await chooseNodeType(harness, 'person');
    await waitFor(() =>
      expect(stageNameInput()).toHaveValue('Person Quick Add Name Generator'),
    );

    await addInterviewNetworkPanel(harness, 'People you already named');

    // The type's own name is shed: `generateStageLabel` caps a proposal at 50
    // characters and sheds detail rather than cutting a word off the end, and
    // "Person Quick Add Name Generator with Network Panels" is 51. The
    // qualifier is the part that survives, which is this stage's point — what
    // it offers beside its question is what makes it a different stage.
    await waitFor(() =>
      expect(stageNameInput()).toHaveValue(
        'Quick Add Name Generator with Network Panels',
      ),
    );
  });
});
