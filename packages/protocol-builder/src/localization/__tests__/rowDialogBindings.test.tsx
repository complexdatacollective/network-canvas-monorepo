import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { alterFormStageEditor } from '../../editors/alter-form/AlterFormStageEditor.ts';
import { dyadCensusStageEditor } from '../../editors/dyad-census/DyadCensusStageEditor.ts';
import {
  loadFixtureStage,
  fixtureStageId,
  fixtureTypeId,
  fixtureVariableId,
} from '../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import { testId } from '../../testing/testId.ts';

const PERSON = fixtureTypeId('node', 'person');
const KNOWS = fixtureTypeId('edge', 'knows');
const CONTACT_FREQ = fixtureVariableId(
  { entity: 'node', typeName: 'person' },
  'contactFreq',
);

const openCensus = () => {
  const { id, type, fields } = loadFixtureStage('dyad-census-1');
  return renderStageEditor({
    stage: {
      id,
      type,
      fields: {
        ...fields,
        prompts: [
          {
            id: testId('dyad-census-prompt-1'),
            text: { 'en-US': 'Who do you know?' },
            createEdge: KNOWS,
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
    const { id, type, fields } = loadFixtureStage('dyad-census-1');
    const harness = renderStageEditor({
      stage: {
        id,
        type,
        fields: {
          ...fields,
          dynamicValues: { today: { path: 'now' } },
          prompts: [
            {
              id: testId('dated'),
              text: { 'en-US': 'Who did you see on {today}?' },
              createEdge: KNOWS,
            },
            {
              id: testId('plain'),
              text: { 'en-US': 'Who do you know?' },
              createEdge: KNOWS,
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
      expect.objectContaining({ id: testId('plain') }),
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
    // Wording by answer is logic, which has a menu of its own.
    await harness.user.click(
      dialog.getByRole('button', {
        name: /Different wording/.test(option.source)
          ? 'Insert logic'
          : 'Inject piped text from interview metadata or a network attribute',
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
    expect(await insertAndSave(/First node: contactFreq.*Ordinal/)).toEqual([
      { path: `dyad.source.${CONTACT_FREQ}` },
    ]);
  });

  it('is bound with its cases when it is shown by answer', async () => {
    const [binding] = await insertAndSave(
      /First node: contactFreq.*Different wording for each answer/,
    );
    expect(binding).toEqual({
      path: `dyad.source.${CONTACT_FREQ}`,
      cases: expect.any(Object),
    });
    expect(Object.keys(binding?.cases ?? {}).length).toBeGreaterThan(0);
  });
});

describe('a value shown by answer in an open dialog', () => {
  it('relabels its versions when an answer is renamed in the codebook', async () => {
    const harness = openCensus();
    await harness.opened();
    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    const dialog = within(await screen.findByRole('dialog'));
    await harness.user.click(
      dialog.getByRole('button', { name: 'Insert logic' }),
    );
    await harness.user.click(
      await screen.findByRole('option', {
        name: /First node: contactFreq.*Different wording for each answer/,
      }),
    );
    expect(
      await dialog.findByRole('textbox', { name: 'Weekly' }),
    ).toBeInTheDocument();

    const person = harness.hostCodebook().node?.[PERSON];
    if (person === undefined) throw new Error('No person type');
    const contactFreq = person.variables?.[CONTACT_FREQ];
    if (contactFreq === undefined) throw new Error('No contactFreq');
    harness.receiveCodebookUpdate({
      node: {
        [PERSON]: {
          ...person,
          variables: {
            ...person.variables,
            [CONTACT_FREQ]: {
              ...contactFreq,
              options: [
                { label: { 'en-US': '**Every** week' }, value: 3 },
                { label: { 'en-US': 'Monthly' }, value: 2 },
                { label: { 'en-US': 'Rarely' }, value: 1 },
              ],
            },
          },
        },
      },
    });

    // The editor takes a new document once the researcher has left it, as
    // they have when they rename the answer in another field.
    await harness.user.click(dialog.getByRole('heading', { level: 2 }));
    // The pill is folded again once the document is rebuilt.
    const pill = await waitFor(() => {
      const found = document.querySelector<HTMLElement>('[data-versions-pill]');
      if (found === null) throw new Error('No pill');
      return found;
    });
    await harness.user.click(pill);
    expect(
      await dialog.findByRole('textbox', { name: 'Every week' }),
    ).toBeInTheDocument();
    expect(
      dialog.queryByRole('textbox', { name: 'Weekly' }),
    ).not.toBeInTheDocument();
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
      name: /First node: flagged.*Add labels for its yes and no answers first/,
    });
    expect(asItself).toHaveAttribute('aria-disabled', 'true');
    await harness.user.click(asItself);
    expect(
      dialog.getByRole('textbox', { name: /^Prompt text/ }),
    ).not.toHaveTextContent('flagged');

    // By answer it needs no labels, and is offered with the logic.
    await harness.user.keyboard('{Escape}');
    await harness.user.click(
      dialog.getByRole('button', { name: 'Insert logic' }),
    );
    expect(
      await screen.findByRole('option', {
        name: /First node: flagged.*Different wording for each answer/,
      }),
    ).not.toHaveAttribute('aria-disabled', 'true');
  });
});

describe("a census prompt's preview", () => {
  it('shows the value its text fills in as a pill', async () => {
    const { id, type, fields } = loadFixtureStage('dyad-census-1');
    const harness = renderStageEditor({
      stage: {
        id,
        type,
        fields: {
          ...fields,
          dynamicValues: { today: { path: 'now' } },
          prompts: [
            {
              id: testId('dated'),
              text: { 'en-US': 'Who did you see on {today}?' },
              createEdge: KNOWS,
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
      stageId: fixtureStageId('alter-form-1'),
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
      stageId: fixtureStageId('alter-form-1'),
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
  it('saves the stage, leaving the untouched translation as it was', async () => {
    const { id, type, fields } = loadFixtureStage('dyad-census-1');
    const harness = renderStageEditor({
      stage: {
        id,
        type,
        fields: {
          ...fields,
          prompts: [
            {
              id: testId('dyad-census-prompt-1'),
              text: {
                'en-US': 'Who do you know?',
                'fr': 'Qui connaissez-vous ?',
              },
              createEdge: KNOWS,
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

    // Piped values are optional: the French text need not show the date.
    const saved = await harness.submit();
    expect(saved).not.toBeNull();
    expect(screen.queryByText(/must show/)).not.toBeInTheDocument();
    expect(JSON.stringify(saved?.stageDocument.prompts)).toContain(
      'Qui connaissez-vous ?',
    );
  });
});

/**
 * The rules an "If" tests are kept on the stage, and editing them in a row's
 * dialog changes them there at once. The row that already tests them stays
 * on the stage whether or not the dialog saves.
 */
describe('rules edited in a row dialog', () => {
  const RULES = [
    {
      id: testId('ties'),
      type: 'edge',
      options: { count: 'GREATER_THAN', value: 0 },
    },
  ];

  const openCensusWithAnIf = () => {
    const { id, type, fields } = loadFixtureStage('dyad-census-1');
    return renderStageEditor({
      stage: {
        id,
        type,
        fields: {
          ...fields,
          dynamicValues: {
            linked: { path: '$condition.linked', cases: { yes: true } },
          },
          conditions: { linked: { about: 'dyadSource', rules: RULES } },
          prompts: [
            {
              id: testId('dyad-census-prompt-1'),
              text: {
                'en-US': 'Do they{linked, select, yes { still} other {}} talk?',
              },
              createEdge: KNOWS,
            },
          ],
        },
      },
      registry: dyadCensusStageEditor,
    });
  };

  /** Opens the prompt, and in it the If's rules, and asks them of the other node. */
  const askTheOtherNode = async (
    harness: ReturnType<typeof openCensusWithAnIf>,
  ) => {
    await harness.opened();
    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    const dialog = within(await screen.findByRole('dialog'));
    const pill = await waitFor(() => {
      const found = document.querySelector<HTMLElement>('[data-versions-pill]');
      if (found === null) throw new Error('No pill');
      return found;
    });
    await harness.user.click(pill);
    await harness.user.click(
      await dialog.findByRole('button', { name: 'Edit rules' }),
    );
    const rules = within(
      await screen.findByRole('dialog', {
        name: 'Edit rules',
      }),
    );
    await harness.user.selectOptions(
      rules.getByRole('combobox', { name: /^Check rules against/ }),
      'The second node of the pair',
    );
    await harness.user.click(rules.getByRole('button', { name: 'Save rules' }));
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', {
          name: 'Edit rules',
        }),
      ).not.toBeInTheDocument(),
    );
    return dialog;
  };

  it('are put back when the dialog is cancelled', async () => {
    const harness = openCensusWithAnIf();
    const dialog = await askTheOtherNode(harness);

    await harness.user.click(dialog.getByRole('button', { name: 'Cancel' }));
    const discard = screen.queryByRole('button', { name: 'Discard changes' });
    if (discard !== null) await harness.user.click(discard);
    await dialogClosed();

    await harness.user.type(
      screen.getByRole('textbox', { name: 'Stage name' }),
      ' again',
    );
    const saved = await harness.submit();
    expect(saved?.stageDocument.conditions).toEqual({
      linked: { about: 'dyadSource', rules: RULES },
    });
  });

  it('are kept when the dialog is saved', async () => {
    const harness = openCensusWithAnIf();
    const dialog = await askTheOtherNode(harness);

    await harness.user.click(dialog.getByRole('button', { name: 'Save' }));
    await dialogClosed();

    const saved = await harness.submit();
    expect(saved?.stageDocument.conditions).toEqual({
      linked: { about: 'dyadTarget', rules: RULES },
    });
  });
});
