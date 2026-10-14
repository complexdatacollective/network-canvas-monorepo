import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { dyadCensusStageEditor } from '../../editors/dyad-census/DyadCensusStageEditor.ts';
import { loadFixtureStage } from '../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';

const openCensus = () => {
  const { type, fields } = loadFixtureStage('dyad-census-1');
  return renderStageEditor({
    stage: {
      type,
      fields: {
        ...fields,
        prompts: [
          {
            id: 'dyad-census-prompt-1',
            text: { 'en-US': 'Who do you know?' },
            createEdge: 'knows',
          },
        ],
      },
    },
    registry: dyadCensusStageEditor,
  });
};

/** Opens the prompt's dialog and inserts today's date into its text. */
const insertTodayInPrompt = async (harness: ReturnType<typeof openCensus>) => {
  await harness.opened();
  await harness.user.click(screen.getByRole('button', { name: 'Edit prompt' }));
  const dialog = within(await screen.findByRole('dialog'));
  await harness.user.click(
    dialog.getByRole('button', { name: 'Insert a value' }),
  );
  await harness.user.click(
    await screen.findByRole('option', { name: /Today’s date/ }),
  );
  expect(
    dialog.getByRole('textbox', { name: /^Prompt text/ }),
  ).toHaveTextContent('Today’s date');
  return dialog;
};

const dialogClosed = () =>
  waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

/**
 * A value inserted in a row's dialog binds on the stage behind it at once,
 * but the row reaches the stage only when the dialog saves.
 */
describe('values inserted in a row dialog', () => {
  it('leave no binding behind when the dialog is cancelled', async () => {
    const harness = openCensus();
    const dialog = await insertTodayInPrompt(harness);

    await harness.user.click(dialog.getByRole('button', { name: 'Cancel' }));
    await harness.user.click(
      await screen.findByRole('button', { name: 'Discard changes' }),
    );
    await dialogClosed();

    // An edit outside the dialog, so the stage has something to save.
    await harness.user.type(
      screen.getByRole('textbox', { name: 'Stage name' }),
      ' again',
    );
    const saved = await harness.submit();
    expect(saved?.stageDocument).not.toHaveProperty('dynamicValues');
  });

  it('keep their binding when the dialog is saved', async () => {
    const harness = openCensus();
    const dialog = await insertTodayInPrompt(harness);

    await harness.user.click(dialog.getByRole('button', { name: 'Save' }));
    await dialogClosed();

    const saved = await harness.submit();
    const bindings = saved?.stageDocument.dynamicValues;
    expect(Object.keys(bindings ?? {})).toHaveLength(1);
    expect(JSON.stringify(saved?.stageDocument.prompts)).toContain(
      `{${Object.keys(bindings ?? {})[0]}`,
    );
  });
});

describe('a deleted row', () => {
  it('takes the binding only it used with it', async () => {
    const { type, fields } = loadFixtureStage('dyad-census-1');
    const harness = renderStageEditor({
      stage: {
        type,
        fields: {
          ...fields,
          dynamicValues: { today: { path: 'now' } },
          prompts: [
            {
              id: 'dated',
              text: { 'en-US': 'Who did you see on {today}?' },
              createEdge: 'knows',
            },
            {
              id: 'plain',
              text: { 'en-US': 'Who do you know?' },
              createEdge: 'knows',
            },
          ],
        },
      },
      registry: dyadCensusStageEditor,
    });
    await harness.opened();

    const [deleteDated] = screen.getAllByRole('button', {
      name: 'Delete prompt',
    });
    if (deleteDated === undefined) throw new Error('No prompt to delete');
    await harness.user.click(deleteDated);
    const confirm = within(await screen.findByRole('dialog'));
    await harness.user.click(confirm.getByRole('button', { name: /Delete/ }));
    await dialogClosed();

    const saved = await harness.submit();
    expect(saved?.stageDocument.prompts).toEqual([
      expect.objectContaining({ id: 'plain' }),
    ]);
    expect(saved?.stageDocument).not.toHaveProperty('dynamicValues');
  });
});

describe('a value with answers inserted in a row dialog', () => {
  const insertAndSave = async (option: RegExp) => {
    const harness = openCensus();
    await harness.opened();
    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    const dialog = within(await screen.findByRole('dialog'));
    await harness.user.click(
      dialog.getByRole('button', { name: 'Insert a value' }),
    );
    await harness.user.click(
      await screen.findByRole('option', { name: option }),
    );
    await harness.user.click(dialog.getByRole('button', { name: 'Save' }));
    await dialogClosed();
    const saved = await harness.submit();
    return Object.values(saved?.stageDocument.dynamicValues ?? {});
  };

  it('is bound without cases when only the value itself is shown', async () => {
    expect(await insertAndSave(/First person: contactFreq.*Ordinal/)).toEqual([
      { path: 'dyad.source.contactFreq' },
    ]);
  });

  it('is bound with its cases when it is shown by answer', async () => {
    const [binding] = await insertAndSave(
      /First person: contactFreq.*Different wording for each answer/,
    );
    expect(binding).toEqual({
      path: 'dyad.source.contactFreq',
      cases: expect.any(Object),
    });
    expect(Object.keys(binding?.cases ?? {}).length).toBeGreaterThan(0);
  });
});
