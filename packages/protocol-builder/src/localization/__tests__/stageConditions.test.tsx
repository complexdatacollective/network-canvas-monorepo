import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

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

const LINKED = testId('condition/linked');
const STILL = testId('dynamic/still');
const STILL_NAME = dynamicValueNameFor({ kind: 'dynamicAttribute', id: STILL });
const STILL_DEFINITION = {
  logic: 'conditions',
  cases: [{ condition: LINKED, when: 'met', wording: { 'en-US': 'still' } }],
  otherwise: { 'en-US': 'ever' },
};
const USES_STILL = `Do they {${STILL_NAME}} talk?`;

/**
 * The stage's conditions and dynamic attributes as its form holds them right
 * now, and whether the form has unsaved changes, read the way a host reads
 * them.
 */
function StageProbe() {
  const conditions = useStageValue('conditions');
  const dynamicAttributes = useStageValue('dynamicAttributes');
  const dirty = useFormStore(selectIsFormDirty);
  return (
    <>
      <p data-testid="conditions">{JSON.stringify(conditions ?? null)}</p>
      <p data-testid="dynamic-attributes">
        {JSON.stringify(dynamicAttributes ?? null)}
      </p>
      <p data-testid="form-dirty">{dirty ? 'dirty' : 'clean'}</p>
    </>
  );
}

const held = (testIdOf: string): unknown =>
  JSON.parse(screen.getByTestId(testIdOf).textContent ?? 'null');
const formIsDirty = () =>
  screen.getByTestId('form-dirty').textContent === 'dirty';

const openCensus = (prompt: string) => {
  const { id, type, fields } = loadFixtureStage('dyad-census-1');
  return renderStageEditor({
    stage: {
      id,
      type,
      fields: {
        ...fields,
        conditions: { [LINKED]: RULES },
        dynamicAttributes: { [STILL]: STILL_DEFINITION },
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
  waitFor(() =>
    expect(
      screen.queryByRole('dialog', { name: /prompt/i }),
    ).not.toBeInTheDocument(),
  );

describe('a dynamic attribute edited in a row dialog that is cancelled', () => {
  it('goes back to what it was, and leaves the stage unchanged', async () => {
    const harness = openCensus(USES_STILL);
    const dialog = await openPrompt(harness);
    expect(formIsDirty()).toBe(false);

    const text = dialog.getByRole('textbox', { name: /^Prompt text/ });
    const pill = await waitFor(() => {
      const found = text.querySelector<HTMLElement>(
        `[data-inline-value="${STILL_NAME}"]`,
      );
      if (found === null) throw new Error('No pill');
      return found;
    });
    // The editor finds what was clicked through `elementFromPoint`.
    const original = document.elementFromPoint.bind(document);
    document.elementFromPoint = () => pill;
    try {
      await harness.user.click(pill);
    } finally {
      document.elementFromPoint = original;
    }
    const settings = await screen.findByRole('dialog', {
      name: 'Dynamic attribute',
    });
    const otherwise = within(settings).getByRole('textbox', {
      name: 'Otherwise',
    });
    await harness.user.clear(otherwise);
    await harness.user.type(otherwise, 'never');
    // The settings write the stage while the row dialog is open.
    await waitFor(() =>
      expect(held('dynamic-attributes')).toMatchObject({
        [STILL]: { otherwise: { 'en-US': 'never' } },
      }),
    );

    await harness.user.keyboard('{Escape}');
    // The row itself is unchanged, so the dialog closes without asking.
    await harness.user.click(dialog.getByRole('button', { name: 'Cancel' }));
    await dialogClosed();

    await waitFor(() => expect(formIsDirty()).toBe(false));
    expect(held('dynamic-attributes')).toEqual({ [STILL]: STILL_DEFINITION });
  });
});

describe('a dynamic attribute removed from a row', () => {
  it('stays on the stage with the condition it tests until the stage is saved, which drops both', async () => {
    const harness = openCensus(USES_STILL);
    const dialog = await openPrompt(harness);

    const text = dialog.getByRole('textbox', { name: /^Prompt text/ });
    await harness.user.click(text);
    await harness.user.keyboard('{Control>}a{/Control}{Backspace}');
    await harness.user.type(text, 'Who do you know?');
    await harness.user.click(dialog.getByRole('button', { name: 'Save' }));
    await dialogClosed();

    // Still there while the stage is edited, so an undo or a paste elsewhere
    // finds its settings.
    expect(held('dynamic-attributes')).toEqual({ [STILL]: STILL_DEFINITION });
    expect(held('conditions')).toEqual({ [LINKED]: RULES });

    const saved = await harness.submit();
    expect(JSON.stringify(saved?.stageDocument.prompts)).not.toContain(
      STILL_NAME,
    );
    expect(saved?.stageDocument).not.toHaveProperty('dynamicAttributes');
    expect(saved?.stageDocument).not.toHaveProperty('conditions');
  });
});
