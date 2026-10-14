import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { alterFormStageEditor } from '../../editors/alter-form/AlterFormStageEditor.ts';
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
    dialog.getByRole('button', {
      name: 'Inject piped text from interview metadata or a network attribute',
    }),
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
      dialog.getByRole('button', {
        name: 'Inject piped text from interview metadata or a network attribute',
      }),
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
    expect(
      await insertAndSave(/contactFreq \(first node in pair\).*Ordinal/),
    ).toEqual([{ path: 'dyad.source.contactFreq' }]);
  });

  it('is bound with its cases when it is shown by answer', async () => {
    const [binding] = await insertAndSave(
      /contactFreq \(first node in pair\).*Different wording for each answer/,
    );
    expect(binding).toEqual({
      path: 'dyad.source.contactFreq',
      cases: expect.any(Object),
    });
    expect(Object.keys(binding?.cases ?? {}).length).toBeGreaterThan(0);
  });
});

describe('a yes-or-no value without labels for its answers', () => {
  it('is listed but cannot be shown as itself, only by answer', async () => {
    const harness = openCensus();
    await harness.opened();
    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    const dialog = within(await screen.findByRole('dialog'));
    await harness.user.click(
      dialog.getByRole('button', {
        name: 'Inject piped text from interview metadata or a network attribute',
      }),
    );

    const asItself = await screen.findByRole('option', {
      name: /flagged \(first node in pair\).*Add labels for its yes and no answers first/,
    });
    expect(asItself).toHaveAttribute('aria-disabled', 'true');
    expect(
      screen.getByRole('option', {
        name: /flagged \(first node in pair\).*Different wording for each answer/,
      }),
    ).not.toHaveAttribute('aria-disabled', 'true');

    await harness.user.click(asItself);
    expect(
      dialog.getByRole('textbox', { name: /^Prompt text/ }),
    ).not.toHaveTextContent('flagged');
  });
});

describe("a census prompt's preview", () => {
  it('shows the value its text fills in as a pill', async () => {
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
          ],
        },
      },
      registry: dyadCensusStageEditor,
    });
    await harness.opened();

    await waitFor(() =>
      expect(document.querySelector('[data-token="today"]')).toHaveTextContent(
        'Today’s date',
      ),
    );
    expect(screen.queryByText(/\{today\}/)).not.toBeInTheDocument();
  });
});

describe('a form field saved before fields had ids', () => {
  it('offers every attribute of the node it asks about', async () => {
    // The fixture's fields carry no ids, as a protocol saved before
    // Architect gave them one does.
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      registry: alterFormStageEditor,
    });
    await harness.opened();
    const [first] = screen.getAllByRole('button', { name: 'Edit field' });
    if (first === undefined) throw new Error('No field to edit');
    await harness.user.click(first);
    const dialog = within(await screen.findByRole('dialog'));
    const [insert] = dialog.getAllByRole('button', {
      name: 'Inject piped text from interview metadata or a network attribute',
    });
    if (insert === undefined) throw new Error('No insert button');
    await harness.user.click(insert);

    const offered = (await screen.findAllByRole('option')).map(
      (option) => option.textContent ?? '',
    );
    // The name comes from an earlier stage; the form asks for the other two,
    // the first field for relationship_to_ego itself.
    for (const attribute of ['name', 'relationship_to_ego', 'flagged']) {
      expect(offered.some((label) => label.startsWith(attribute))).toBe(true);
    }
  });
});

describe("a value inserted in a form field's question", () => {
  it('shows in the field preview as a pill rather than crashing it', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      registry: alterFormStageEditor,
    });
    await harness.opened();
    const [first] = screen.getAllByRole('button', { name: 'Edit field' });
    if (first === undefined) throw new Error('No field to edit');
    await harness.user.click(first);
    const dialog = within(await screen.findByRole('dialog'));
    const [insert] = dialog.getAllByRole('button', {
      name: 'Inject piped text from interview metadata or a network attribute',
    });
    if (insert === undefined) throw new Error('No insert button');
    await harness.user.click(insert);
    await harness.user.click(
      await screen.findByRole('option', { name: /Today’s date/ }),
    );

    // The preview is the interview's own field, shown with no participant to
    // fill the value in from.
    const preview = await dialog.findByRole('region', {
      name: 'Interactive preview',
    });
    await waitFor(() =>
      expect(preview.querySelector('[data-token="today"]')).toHaveTextContent(
        'Today’s date',
      ),
    );
    expect(preview).toHaveTextContent("What is this person's relationship");
    expect(preview).not.toHaveTextContent('{today}');
  });
});

describe('a value inserted in default-language text that is translated', () => {
  it('refuses the stage save until the translation shows it too', async () => {
    const { type, fields } = loadFixtureStage('dyad-census-1');
    const harness = renderStageEditor({
      stage: {
        type,
        fields: {
          ...fields,
          prompts: [
            {
              id: 'dyad-census-prompt-1',
              text: {
                'en-US': 'Who do you know?',
                'fr': 'Qui connaissez-vous ?',
              },
              createEdge: 'knows',
            },
          ],
        },
      },
      registry: dyadCensusStageEditor,
      localization: { defaultLocale: 'en-US', locales: ['en-US', 'fr'] },
    });
    const dialog = await insertTodayInPrompt(harness);
    await harness.user.click(dialog.getByRole('button', { name: 'Save' }));
    await dialogClosed();

    // The French text, untouched, no longer shows every value the English
    // text does; the protocol would not accept the stage.
    expect(await harness.submit()).toBeNull();
    expect(
      (await screen.findAllByText(/This translation must show "\{today/))
        .length,
    ).toBeGreaterThan(0);
  });
});
