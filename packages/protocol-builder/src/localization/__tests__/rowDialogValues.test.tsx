import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  dynamicValueNameFor,
  optionCaseKey,
} from '@codaco/protocol-validation';

import { alterFormStageEditor } from '../../editors/alter-form/AlterFormStageEditor.ts';
import { dyadCensusStageEditor } from '../../editors/dyad-census/DyadCensusStageEditor.ts';
import {
  caretInQuestion,
  formEditor,
} from '../../sections/form-document/__tests__/formDocumentTesting.ts';
import {
  attributeField,
  chooseAttributeById,
  openAttributePicker,
} from '../../testing/attributePicker.ts';
import {
  loadFixtureStage,
  fixtureOptionId,
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
const FLAGGED = fixtureVariableId(
  { entity: 'node', typeName: 'person' },
  'flagged',
);

/** The first node of the pair's contactFreq and flagged, as text names them. */
const FIRST_CONTACT_FREQ = dynamicValueNameFor({
  kind: 'attribute',
  role: 'dyadSource',
  variableId: CONTACT_FREQ,
});
const FIRST_FLAGGED = dynamicValueNameFor({
  kind: 'attribute',
  role: 'dyadSource',
  variableId: FLAGGED,
});

/** A condition on the first node of the pair. */
const LINKED = testId('condition/linked');
const RULES = [
  {
    id: testId('ties'),
    type: 'edge',
    options: { count: 'GREATER_THAN', value: 0 },
  },
];

/** A dynamic attribute that tests the condition, and text that shows it. */
const STILL = testId('dynamic/still');
const STILL_NAME = dynamicValueNameFor({ kind: 'dynamicAttribute', id: STILL });
const STILL_DEFINITION = {
  logic: 'conditions',
  cases: [{ condition: LINKED, when: 'met', wording: { 'en-US': 'still' } }],
  otherwise: { 'en-US': 'ever' },
};
const USES_STILL = `Do they {${STILL_NAME}} talk?`;

/** The name of the list that the toolbar's Attribute button opens. */
const ATTRIBUTE_MENU = 'Insert an attribute';

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

type Harness = ReturnType<typeof openCensus>;

/** Opens the only prompt's dialog, and hands back the dialog. */
const openPrompt = async (harness: Harness) => {
  await harness.opened();
  await harness.user.click(screen.getByRole('button', { name: 'Edit prompt' }));
  return within(await screen.findByRole('dialog'));
};

/** Opens the attribute list from the toolbar of the open row's text. */
const openAttributeMenu = async (
  harness: Harness,
  dialog: ReturnType<typeof within>,
) => {
  await harness.user.click(dialog.getByRole('button', { name: 'Attribute' }));
  return within(await screen.findByRole('dialog', { name: ATTRIBUTE_MENU }));
};

/** Opens the prompt's dialog and inserts today's date into its text. */
const insertTodayInPrompt = async (harness: Harness) => {
  const dialog = await openPrompt(harness);
  const menu = await openAttributeMenu(harness, dialog);
  await harness.user.click(menu.getByRole('option', { name: /Today’s date/ }));
  await waitFor(() =>
    expect(
      dialog.getByRole('textbox', { name: /^Prompt text/ }),
    ).toHaveTextContent('Today’s date'),
  );
  return dialog;
};

/**
 * Clicks a value's pill in a text. The editor finds what was clicked through
 * `elementFromPoint`, which jsdom does not implement, so the pill is what is
 * at every point while it is clicked.
 */
const clickPill = async (harness: Harness, text: HTMLElement, name: string) => {
  const pill = await waitFor(() => {
    const found = text.querySelector<HTMLElement>(
      `[data-inline-value="${name}"]`,
    );
    if (found === null) throw new Error(`No pill for ${name}`);
    return found;
  });
  const original = document.elementFromPoint.bind(document);
  document.elementFromPoint = () => pill;
  try {
    await harness.user.click(pill);
  } finally {
    document.elementFromPoint = original;
  }
};

const dialogClosed = () =>
  waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

/** The names the text of the stage's prompts uses for its values. */
const promptsText = (prompts: unknown) => JSON.stringify(prompts);

/**
 * What a row's dialog inserts is written into the row's text, and the row
 * reaches the stage only when the dialog saves. (A dynamic attribute also
 * declares itself on the stage while the dialog is open, and a dialog that
 * closes without saving puts the stage back exactly as it was: see
 * `stageConditions.test.tsx`.)
 */
describe('values inserted in a row dialog', () => {
  it('leave the stage as it was when the dialog is cancelled', async () => {
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
    expect(saved?.stageDocument.prompts).toEqual([
      expect.objectContaining({ text: { 'en-US': 'Who do you know?' } }),
    ]);
    expect(saved?.stageDocument).not.toHaveProperty('conditions');
    expect(saved?.stageDocument).not.toHaveProperty('dynamicAttributes');
  });

  it('are in the row’s text by name when the dialog is saved', async () => {
    const harness = openCensus();
    const dialog = await insertTodayInPrompt(harness);

    await harness.user.click(dialog.getByRole('button', { name: 'Save' }));
    await dialogClosed();

    const saved = await harness.submit();
    expect(saved?.stageDocument.prompts).toEqual([
      expect.objectContaining({
        text: { 'en-US': '{now}Who do you know?' },
      }),
    ]);
  });
});

describe('a deleted row', () => {
  it('takes with it the dynamic attribute only it showed, and the condition only that tested', async () => {
    const { id, type, fields } = loadFixtureStage('dyad-census-1');
    const harness = renderStageEditor({
      stage: {
        id,
        type,
        fields: {
          ...fields,
          conditions: { [LINKED]: { about: 'dyadSource', rules: RULES } },
          dynamicAttributes: { [STILL]: STILL_DEFINITION },
          prompts: [
            {
              id: testId('dated'),
              text: { 'en-US': USES_STILL },
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
    expect(saved?.stageDocument).not.toHaveProperty('dynamicAttributes');
    expect(saved?.stageDocument).not.toHaveProperty('conditions');
  });
});

describe('a value with answers inserted in a row dialog', () => {
  it('is written by its name when the value itself is shown', async () => {
    const harness = openCensus();
    const dialog = await openPrompt(harness);
    const menu = await openAttributeMenu(harness, dialog);
    await harness.user.click(
      menu.getByRole('option', { name: /^First node: contactFreq/ }),
    );
    await harness.user.click(dialog.getByRole('button', { name: 'Save' }));
    await dialogClosed();

    const saved = await harness.submit();
    const text = promptsText(saved?.stageDocument.prompts);
    expect(text).toContain(`{${FIRST_CONTACT_FREQ}}`);
    expect(text).not.toContain(`{${FIRST_CONTACT_FREQ}, select,`);
    expect(saved?.stageDocument).not.toHaveProperty('dynamicAttributes');
  });

  it('gets a version for each answer, by its option’s id, from a dynamic attribute', async () => {
    const harness = openCensus();
    const dialog = await openPrompt(harness);
    const menu = await openAttributeMenu(harness, dialog);
    await harness.user.click(
      menu.getByRole('option', { name: 'Create dynamic attribute' }),
    );
    const create = await screen.findByRole('dialog', {
      name: 'Create a dynamic attribute',
    });

    await harness.user.click(
      within(create).getByRole('combobox', { name: /^Logic/ }),
    );
    await harness.user.click(
      await screen.findByRole('option', {
        name: /^Different wording for each answer/,
      }),
    );
    await chooseAttributeById(
      harness.user,
      attributeField('Attribute', create),
      FIRST_CONTACT_FREQ,
    );

    const variable =
      harness.hostCodebook().node?.[PERSON]?.variables?.[CONTACT_FREQ];
    const options = variable?.type === 'ordinal' ? variable.options : [];
    expect(options.length).toBeGreaterThan(0);
    // Each answer is offered by its label, and written for by its id.
    for (const option of options) {
      await harness.user.type(
        within(create).getByRole('textbox', {
          name: String(option.label['en-US']),
        }),
        `often ${option.value}`,
      );
    }
    await harness.user.type(
      within(create).getByRole('textbox', { name: 'If not known' }),
      'unknown',
    );
    await harness.user.type(
      within(create).getByRole('textbox', { name: 'Any other answer' }),
      'other',
    );
    await harness.user.click(
      within(create).getByRole('button', { name: 'Create dynamic attribute' }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Create a dynamic attribute' }),
      ).not.toBeInTheDocument(),
    );

    await harness.user.click(dialog.getByRole('button', { name: 'Save' }));
    await dialogClosed();
    const saved = await harness.submit();

    const definitions = Object.entries(
      (saved?.stageDocument.dynamicAttributes ?? {}) as Record<
        string,
        { value?: string; answers?: { answer: string }[] }
      >,
    );
    expect(definitions).toHaveLength(1);
    const [[id, definition]] = definitions as [
      [string, (typeof definitions)[0][1]],
    ];
    expect(definition.value).toBe(FIRST_CONTACT_FREQ);
    expect(definition.answers?.map((each) => each.answer)).toEqual(
      options.map((option) => optionCaseKey(option.id)),
    );
    expect(promptsText(saved?.stageDocument.prompts)).toContain(
      `{${dynamicValueNameFor({ kind: 'dynamicAttribute', id })}}`,
    );
  });
});

describe('a dynamic attribute shown by answer in an open dialog', () => {
  it('relabels its versions when an answer is renamed in the codebook', async () => {
    const BY_FREQUENCY = testId('dynamic/by-frequency');
    const BY_FREQUENCY_NAME = dynamicValueNameFor({
      kind: 'dynamicAttribute',
      id: BY_FREQUENCY,
    });
    const WEEKLY = fixtureOptionId(
      { entity: 'node', typeName: 'person' },
      'contactFreq',
      3,
    );
    const { id, type, fields } = loadFixtureStage('dyad-census-1');
    const harness = renderStageEditor({
      stage: {
        id,
        type,
        fields: {
          ...fields,
          dynamicAttributes: {
            [BY_FREQUENCY]: {
              logic: 'answers',
              value: FIRST_CONTACT_FREQ,
              missing: { 'en-US': 'sometimes' },
              answers: [
                {
                  answer: optionCaseKey(WEEKLY),
                  wording: { 'en-US': 'every week' },
                },
              ],
              other: { 'en-US': 'often' },
            },
          },
          prompts: [
            {
              id: testId('dyad-census-prompt-1'),
              text: { 'en-US': `Do they talk {${BY_FREQUENCY_NAME}}?` },
              createEdge: KNOWS,
            },
          ],
        },
      },
      registry: dyadCensusStageEditor,
    });
    const person = harness.hostCodebook().node?.[PERSON];
    if (person === undefined) throw new Error('No person type');
    const contactFreq = person.variables?.[CONTACT_FREQ];
    if (contactFreq?.type !== 'ordinal') throw new Error('No contactFreq');

    const dialog = await openPrompt(harness);
    await clickPill(
      harness,
      dialog.getByRole('textbox', { name: /^Prompt text/ }),
      BY_FREQUENCY_NAME,
    );
    const settings = within(
      await screen.findByRole('dialog', { name: 'Dynamic attribute' }),
    );
    expect(
      await settings.findByRole('textbox', { name: 'Weekly' }),
    ).toBeInTheDocument();

    harness.receiveCodebookUpdate({
      node: {
        [PERSON]: {
          ...person,
          variables: {
            ...person.variables,
            [CONTACT_FREQ]: {
              ...contactFreq,
              // The same options, by id, one of them relabelled.
              options: contactFreq.options.map((option) =>
                option.id === WEEKLY
                  ? { ...option, label: { 'en-US': '**Every** week' } }
                  : option,
              ),
            },
          },
        },
      },
    });

    expect(
      await settings.findByRole('textbox', { name: 'Every week' }),
    ).toBeInTheDocument();
    expect(
      settings.queryByRole('textbox', { name: 'Weekly' }),
    ).not.toBeInTheDocument();
  });
});

describe('a yes-or-no value without labels for its answers', () => {
  it('is listed but cannot be shown as itself, only chosen by in a dynamic attribute', async () => {
    const harness = openCensus();
    const dialog = await openPrompt(harness);
    const menu = await openAttributeMenu(harness, dialog);

    const asItself = menu.getByRole('option', { name: /^First node: flagged/ });
    expect(asItself).toHaveAttribute('aria-disabled', 'true');
    expect(asItself).toHaveTextContent(
      'Add labels for its yes and no answers first',
    );
    await harness.user.click(asItself);
    expect(
      dialog.getByRole('textbox', { name: /^Prompt text/ }),
    ).not.toHaveTextContent('flagged');

    // By answer it needs no labels: a dynamic attribute can choose by it.
    await harness.user.click(
      menu.getByRole('option', { name: 'Create dynamic attribute' }),
    );
    const create = await screen.findByRole('dialog', {
      name: 'Create a dynamic attribute',
    });
    await harness.user.click(
      within(create).getByRole('combobox', { name: /^Logic/ }),
    );
    await harness.user.click(
      await screen.findByRole('option', {
        name: /^Different wording for each answer/,
      }),
    );
    const picker = await openAttributePicker(
      harness.user,
      attributeField('Attribute', create),
    );
    const row = picker.querySelector<HTMLElement>(
      `[role="option"][data-attribute-id="${CSS.escape(FIRST_FLAGGED)}"]`,
    );
    expect(row).not.toBeNull();
    expect(row).not.toHaveAttribute('data-unavailable');
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
          prompts: [
            {
              id: testId('dated'),
              text: { 'en-US': 'Who did you see on {now}?' },
              createEdge: KNOWS,
            },
          ],
        },
      },
      registry: dyadCensusStageEditor,
    });
    await harness.opened();

    await waitFor(() =>
      expect(
        document.querySelector('data[data-attribute-type="datetime"]'),
      ).toHaveTextContent('Today’s date'),
    );
    expect(screen.queryByText(/\{now\}/)).not.toBeInTheDocument();
  });
});

describe("a form's text", () => {
  /** The fixture alter form's fields, as the stage stores them. */
  const fixtureFields = () => {
    const form = loadFixtureStage('alter-form-1').fields.form as {
      fields: readonly { id: string; prompt: Record<string, string> }[];
    };
    return form.fields;
  };

  it('offers every attribute of the node it asks about', async () => {
    const harness = renderStageEditor({
      stageId: fixtureStageId('alter-form-1'),
      registry: alterFormStageEditor,
    });
    await harness.opened();
    const editor = await formEditor();
    const [first] = fixtureFields();
    if (first === undefined) throw new Error('The fixture has no field.');
    await caretInQuestion(harness, editor, first.id);
    await harness.user.click(screen.getByRole('button', { name: 'Attribute' }));
    const menu = within(
      await screen.findByRole('dialog', { name: ATTRIBUTE_MENU }),
    );

    const offered = menu
      .getAllByRole('option')
      .map((option) => option.textContent ?? '');
    // The name comes from an earlier stage; the form asks for the other two,
    // the first field for relationship_to_ego itself.
    for (const attribute of ['name', 'relationship_to_ego', 'flagged']) {
      expect(offered.some((label) => label.startsWith(attribute))).toBe(true);
    }
  });

  it('shows a value inserted in a field’s question as a pill, and saves it by name', async () => {
    const harness = renderStageEditor({
      stageId: fixtureStageId('alter-form-1'),
      registry: alterFormStageEditor,
    });
    await harness.opened();
    const editor = await formEditor();
    const [first] = fixtureFields();
    if (first === undefined) throw new Error('The fixture has no field.');
    await caretInQuestion(harness, editor, first.id);
    await harness.user.click(screen.getByRole('button', { name: 'Attribute' }));
    const menu = within(
      await screen.findByRole('dialog', { name: ATTRIBUTE_MENU }),
    );
    await harness.user.click(
      menu.getByRole('option', { name: /Today’s date/ }),
    );

    // The question is drawn as the participant sees it, the value as a pill.
    const question = await waitFor(() => {
      const found = editor
        .querySelector(`[data-field-id="${first.id}"]`)
        ?.querySelector<HTMLElement>('[data-field-label]');
      if (found === null || found === undefined) throw new Error('No question');
      return found;
    });
    await waitFor(() =>
      expect(
        question.querySelector('data[data-attribute-type="datetime"]'),
      ).toHaveTextContent('Today’s date'),
    );
    expect(question).toHaveTextContent("What is this person's relationship");
    expect(question).not.toHaveTextContent('{now}');

    const saved = await harness.submit();
    const form = saved?.stageDocument.form as
      | { fields: { id: string; prompt: Record<string, string> }[] }
      | undefined;
    expect(
      form?.fields.find((field) => field.id === first.id)?.prompt['en-US'],
    ).toBe(`{now}${first.prompt['en-US']}`);
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

    // Values are optional: the French text need not show the date.
    const saved = await harness.submit();
    expect(saved).not.toBeNull();
    expect(screen.queryByText(/must show/)).not.toBeInTheDocument();
    const text = promptsText(saved?.stageDocument.prompts);
    expect(text).toContain('{now}');
    expect(text).toContain('Qui connaissez-vous ?');
  });
});

/**
 * The rules of a dynamic attribute's case are kept on the stage, and editing
 * them in a row's dialog changes them there at once. The row that already
 * shows the dynamic attribute stays on the stage whether or not the dialog
 * saves.
 */
describe('rules edited in a row dialog', () => {
  const openCensusWithAnIf = () => {
    const { id, type, fields } = loadFixtureStage('dyad-census-1');
    return renderStageEditor({
      stage: {
        id,
        type,
        fields: {
          ...fields,
          conditions: { [LINKED]: { about: 'dyadSource', rules: RULES } },
          dynamicAttributes: { [STILL]: STILL_DEFINITION },
          prompts: [
            {
              id: testId('dyad-census-prompt-1'),
              text: { 'en-US': USES_STILL },
              createEdge: KNOWS,
            },
          ],
        },
      },
      registry: dyadCensusStageEditor,
    });
  };

  /** Opens the prompt, and in it the case's rules, and asks them of the other node. */
  const askTheOtherNode = async (harness: Harness) => {
    const dialog = await openPrompt(harness);
    await clickPill(
      harness,
      dialog.getByRole('textbox', { name: /^Prompt text/ }),
      STILL_NAME,
    );
    const settings = within(
      await screen.findByRole('dialog', { name: 'Dynamic attribute' }),
    );
    await harness.user.selectOptions(
      settings.getByRole('combobox', { name: /^Check rules against/ }),
      'The second node of the pair',
    );
    await harness.user.keyboard('{Escape}');
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Dynamic attribute' }),
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
      [LINKED]: { about: 'dyadSource', rules: RULES },
    });
  });

  it('are kept when the dialog is saved', async () => {
    const harness = openCensusWithAnIf();
    const dialog = await askTheOtherNode(harness);

    await harness.user.click(dialog.getByRole('button', { name: 'Save' }));
    await dialogClosed();

    const saved = await harness.submit();
    expect(saved?.stageDocument.conditions).toEqual({
      [LINKED]: { about: 'dyadTarget', rules: RULES },
    });
  });
});
