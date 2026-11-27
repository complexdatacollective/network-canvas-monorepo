import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  testId,
  testVariableId,
} from '@codaco/protocol-builder/testing/testId';
import {
  type CurrentProtocol,
  dynamicValueNameFor,
} from '@codaco/protocol-validation';
import { getProtocol } from '~/selectors/protocol';

import { dynamicValuesProtocol, FIRST_NAME } from './dynamicValuesProtocol';
import {
  type RenderedTable,
  renderTranslationTable,
} from './renderTranslationTable';

const WELCOME = `Welcome back, {${FIRST_NAME}}`;

const protocol = dynamicValuesProtocol({ en: WELCOME });

const renderTable = (initial: CurrentProtocol = protocol) =>
  renderTranslationTable(initial);

const title = (store: RenderedTable['store']): unknown => {
  const stage = getProtocol(store.getState())?.stages[0];
  return stage && 'content' in stage ? stage.content : undefined;
};

const cellName = (language: string) => new RegExp(`Content ${language}$`);

const titleCell = (language: string) =>
  screen.getByRole('button', { name: cellName(language) });

/** Leaves the cell for the stage name's English cell. */
const leaveCell = async (user: RenderedTable['user']) => {
  await user.click(
    screen.getByRole('textbox', { name: /Stage name English$/ }),
  );
};

describe('TranslationTable: text that shows values', () => {
  it('shows each value as the pill the stage editor draws, until the cell has focus', () => {
    renderTable();

    const cell = titleCell('English').closest('td');
    // The pill names the attribute; the text's own name for it is not shown.
    expect(
      cell?.querySelector('data[data-attribute-type="text"]'),
    ).toHaveTextContent('first_name');
    expect(cell).toHaveTextContent('first_name');
    expect(cell).not.toHaveTextContent(FIRST_NAME);
  });

  it('keeps the values a translation shows when the table is saved', async () => {
    const { store, user } = renderTable();

    await user.click(titleCell('English'));
    const editor = await screen.findByRole('textbox', {
      name: cellName('English'),
    });
    await waitFor(() => expect(editor).toHaveFocus());
    await leaveCell(user);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(title(store)).toEqual({ en: WELCOME });
  });

  it('saves a translation that leaves out a value the original text shows', async () => {
    const { store, user } = renderTable();

    await user.click(titleCell('French'));
    const editor = await screen.findByRole('textbox', {
      name: cellName('French'),
    });
    await waitFor(() => expect(editor).toHaveFocus());
    await user.type(editor, 'Bon retour');
    await leaveCell(user);

    expect(titleCell('French')).not.toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByText(/must show/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(title(store)).toEqual({ en: WELCOME, fr: 'Bon retour' }),
    );
  });

  // The stage shows no value anywhere yet: its text still offers them, as
  // its editor on the stage does.
  it('saves a default-language edit that adds a value an untouched translation does not show', async () => {
    const [stage] = protocol.stages;
    const { store, user } = renderTable({
      ...protocol,
      stages: [{ ...stage, content: { en: 'Welcome back', fr: 'Bon retour' } }],
    } as CurrentProtocol);

    await user.click(titleCell('English'));
    const editor = await screen.findByRole('textbox', {
      name: cellName('English'),
    });
    await waitFor(() => expect(editor).toHaveFocus());
    await user.click(screen.getByRole('button', { name: 'Attribute' }));
    const [option] = await screen.findAllByRole('option', {
      name: /Today’s date/,
    });
    if (option === undefined) throw new Error('No value offered');
    await user.click(option);
    await waitFor(() =>
      expect(editor.querySelector('[data-inline-value="now"]')).not.toBeNull(),
    );
    await leaveCell(user);

    expect(titleCell('French')).not.toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByText(/must show/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(title(store)).toMatchObject({ fr: 'Bon retour' }),
    );
    expect(JSON.stringify(title(store))).toContain('{now');
  });

  it('lets a translation insert any value its place can show', async () => {
    const [stage] = protocol.stages;
    const mood = testVariableId('mood');
    const happy = testId('option/happy');
    const moodName = dynamicValueNameFor({
      kind: 'attribute',
      role: 'ego',
      variableId: mood,
    });
    const { user } = renderTable({
      ...protocol,
      codebook: {
        ...protocol.codebook,
        ego: {
          variables: {
            ...protocol.codebook.ego?.variables,
            [mood]: {
              name: 'mood',
              type: 'categorical',
              options: [
                { id: happy, value: 'happy', label: { en: 'Happy' } },
                {
                  id: testId('option/sad'),
                  value: 'sad',
                  label: { en: 'Sad' },
                },
              ],
            },
          },
        },
      },
      stages: [
        {
          ...stage,
          content: { en: `Hello, {${moodName}}` },
        },
      ],
    } as unknown as CurrentProtocol);

    await user.click(titleCell('French'));
    const editor = await screen.findByRole('textbox', {
      name: cellName('French'),
    });
    await waitFor(() => expect(editor).toHaveFocus());
    await user.click(screen.getByRole('button', { name: 'Attribute' }));
    const offered = (await screen.findAllByRole('option')).map(
      (option) => option.textContent ?? '',
    );
    expect(offered.some((label) => label.includes('mood'))).toBe(true);
    expect(offered.some((label) => label.includes('first_name'))).toBe(true);
  });
});

/**
 * The pill of a value its place cannot offer says what the value was, and
 * shows the name that the text uses for it only when that name refers to no
 * kind of value at all.
 */
describe.each([
  ['a name that refers to no kind of value', 'ghost', 'ghost'],
  [
    'an attribute the codebook does not have',
    dynamicValueNameFor({
      kind: 'attribute',
      role: 'ego',
      variableId: testVariableId('deleted'),
    }),
    'Deleted attribute',
  ],
])('TranslationTable: text naming %s', (_, ghost, shown) => {
  const ghostTitle = {
    en: `{${ghost}} welcome`,
    fr: `{${ghost}} bienvenue`,
  };

  it('keeps the value as a pill when reading', () => {
    renderTable(dynamicValuesProtocol(ghostTitle));

    const cell = titleCell('English').closest('td');
    expect(
      cell?.querySelector('data[data-attribute-missing]'),
    ).toHaveTextContent(shown);
    expect(cell).toHaveTextContent(`${shown} welcome`);
  });

  it('keeps the value as a pill when editing', async () => {
    const { user } = renderTable(dynamicValuesProtocol(ghostTitle));

    await user.click(titleCell('English'));
    const editor = await screen.findByRole('textbox', {
      name: cellName('English'),
    });
    await waitFor(() =>
      expect(
        editor.querySelector(`[data-inline-value="${ghost}"]`),
      ).toHaveTextContent(shown),
    );
    expect(editor).toHaveTextContent(/welcome$/);
  });

  it('refuses the text at its cell once the cell is left', async () => {
    const { user } = renderTable(dynamicValuesProtocol(ghostTitle));

    await user.click(titleCell('English'));
    const editor = await screen.findByRole('textbox', {
      name: cellName('English'),
    });
    await waitFor(() => expect(editor).toHaveFocus());
    await user.type(editor, ' there');
    await leaveCell(user);

    await waitFor(() =>
      expect(titleCell('English')).toHaveAttribute('aria-invalid', 'true'),
    );
  });
});

const AGE_ID = testVariableId('age');
const YEARS = testId('years-wording');

/**
 * The stage above with a dynamic attribute that words the participant's age
 * as a number of years, in English only.
 */
const protocolWithNumberWording = (() => {
  const years = `{${dynamicValueNameFor({ kind: 'dynamicAttribute', id: YEARS })}}`;
  const base = dynamicValuesProtocol({
    en: `You are ${years} old`,
    fr: `Vous avez ${years}`,
  });
  const [stage] = base.stages;
  return {
    ...base,
    codebook: {
      ...base.codebook,
      ego: {
        variables: {
          ...base.codebook.ego?.variables,
          [AGE_ID]: { name: 'age', type: 'number' },
        },
      },
    },
    stages: [
      {
        ...stage,
        dynamicAttributes: {
          [YEARS]: {
            logic: 'number',
            value: dynamicValueNameFor({
              kind: 'attribute',
              role: 'ego',
              variableId: AGE_ID,
            }),
            missing: { en: 'of an age we do not know' },
            wording: { en: '{count, plural, one {# year} other {# years}}' },
          },
        },
      },
    ],
  } as unknown as CurrentProtocol;
})();

describe('TranslationTable: the number wording of a dynamic attribute', () => {
  it('opens a language without wording with a version for each of its plural forms, and offers nothing to put in', async () => {
    const { user } = renderTable(protocolWithNumberWording);

    const name = /Wording for singular or plural numbers French$/;
    await user.click(screen.getByRole('button', { name }));
    const editor = await screen.findByRole('textbox', { name });
    await waitFor(() => expect(editor).toHaveFocus());

    expect(
      [...document.querySelectorAll('[data-version]')].map((version) =>
        version.getAttribute('data-version'),
      ),
    ).toEqual(['one', 'many', 'other']);
    expect(
      screen.queryByRole('button', { name: 'Attribute' }),
    ).not.toBeInTheDocument();
  });
});
