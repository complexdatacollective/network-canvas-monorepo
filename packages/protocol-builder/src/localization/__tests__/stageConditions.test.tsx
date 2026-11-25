import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { selectIsFormDirty } from '@codaco/fresco-ui/form/store/formStoreProvider';
import { dynamicValueNameFor } from '@codaco/protocol-validation';

import { dyadCensusStageEditor } from '../../editors/dyad-census/DyadCensusStageEditor.ts';
import { useStageValue } from '../../form/stageFormHooks.ts';
import {
  fixtureTypeId,
  loadFixtureStage,
} from '../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import { testId } from '../../testing/testId.ts';
import type { ConditionDraft } from '../conditionText.ts';

const KNOWS = fixtureTypeId('edge', 'knows');

const RULES: ConditionDraft = {
  about: 'dyadSource',
  rules: [
    {
      id: testId('ties'),
      type: 'edge',
      options: { count: 'GREATER_THAN', value: 0 },
    },
  ],
};

// The rule builder is tested on its own; here the dialog only hands back the
// rules a researcher set, so what the stage keeps of them is what is asked.
vi.mock('../../rules/ConditionDialog.tsx', () => ({
  default: ({ onSave }: { onSave: (condition: ConditionDraft) => void }) => (
    <button type="button" onClick={() => onSave(RULES)}>
      Save rules
    </button>
  ),
}));

const LINKED = testId('condition/linked');
const LINKED_NAME = dynamicValueNameFor({
  kind: 'condition',
  conditionId: LINKED,
});
const TESTS_LINKED = `Do they{${LINKED_NAME}, select, true { still} other {}} talk?`;

/**
 * The stage's conditions as its form holds them right now, and whether the
 * form has unsaved changes, read the way a host reads them.
 */
function StageProbe() {
  const conditions = useStageValue('conditions');
  const dirty = useFormStore(selectIsFormDirty);
  return (
    <>
      <p data-testid="conditions">{JSON.stringify(conditions ?? null)}</p>
      <p data-testid="form-dirty">{dirty ? 'dirty' : 'clean'}</p>
    </>
  );
}

const heldConditions = (): unknown =>
  JSON.parse(screen.getByTestId('conditions').textContent ?? 'null');
const formIsDirty = () =>
  screen.getByTestId('form-dirty').textContent === 'dirty';

const openCensus = (
  prompt: string,
  conditions?: Readonly<Record<string, unknown>>,
) => {
  const { id, type, fields } = loadFixtureStage('dyad-census-1');
  return renderStageEditor({
    stage: {
      id,
      type,
      fields: {
        ...fields,
        ...(conditions !== undefined && { conditions }),
        prompts: [
          {
            id: testId('dyad-census-prompt-1'),
            text: { 'en-US': prompt },
            createEdge: KNOWS,
          },
        ],
      },
    },
    registry: dyadCensusStageEditor,
    header: () => <StageProbe />,
  });
};

const openPrompt = async (harness: ReturnType<typeof openCensus>) => {
  await harness.opened();
  await harness.user.click(screen.getByRole('button', { name: 'Edit prompt' }));
  return within(await screen.findByRole('dialog'));
};

const dialogClosed = () =>
  waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

describe('an "If" inserted in a row dialog that is cancelled', () => {
  it('leaves the stage’s conditions as they were, and the stage unchanged', async () => {
    const harness = openCensus('Who do you know?');
    const dialog = await openPrompt(harness);
    expect(heldConditions()).toBeNull();
    expect(formIsDirty()).toBe(false);

    await harness.user.click(
      dialog.getByRole('textbox', { name: /^Prompt text/ }),
    );
    await harness.user.click(
      dialog.getByRole('button', { name: 'Insert logic' }),
    );
    await harness.user.click(
      await screen.findByRole('option', { name: /^If … else/ }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Save rules' }),
    );
    // The "If" declared its condition on the stage while the dialog was open.
    await waitFor(() =>
      expect(Object.values(heldConditions() ?? {})).toEqual([RULES]),
    );

    await harness.user.click(dialog.getByRole('button', { name: 'Cancel' }));
    await harness.user.click(
      await screen.findByRole('button', { name: 'Discard changes' }),
    );
    await dialogClosed();

    // Nothing is left to save: not even an empty set of conditions.
    await waitFor(() => expect(formIsDirty()).toBe(false));
    expect(heldConditions()).toBeNull();
  });
});

describe('an "If" removed from a row', () => {
  it('leaves its condition on the stage until the stage is saved, which drops it', async () => {
    const harness = openCensus(TESTS_LINKED, { [LINKED]: RULES });
    const dialog = await openPrompt(harness);

    const text = dialog.getByRole('textbox', { name: /^Prompt text/ });
    await harness.user.click(text);
    await harness.user.keyboard('{Control>}a{/Control}{Backspace}');
    await harness.user.type(text, 'Who do you know?');
    await harness.user.click(dialog.getByRole('button', { name: 'Save' }));
    await dialogClosed();

    // Still there while the stage is edited, so an undo or a paste elsewhere
    // finds its rules.
    expect(heldConditions()).toEqual({ [LINKED]: RULES });

    const saved = await harness.submit();
    expect(JSON.stringify(saved?.stageDocument.prompts)).not.toContain(
      LINKED_NAME,
    );
    expect(saved?.stageDocument).not.toHaveProperty('conditions');
  });
});
