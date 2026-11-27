import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import Form from '@codaco/fresco-ui/form/Form';
import type {
  LocalizedString,
  MessageArguments,
} from '@codaco/protocol-validation';

import type { ProtocolLocalization } from '../../localization/localizedText.ts';
import { ProtocolLocalizationProvider } from '../../localization/ProtocolLocalization.tsx';
import LocalizedMessageField, {
  LocalizedMessageVersionsSummary,
  localizedMessageValidation,
} from '../LocalizedMessageField.tsx';

const ARGUMENTS: MessageArguments = {
  isYou: { kind: 'select', cases: ['true'] },
  name: { kind: 'text' },
  missing: { kind: 'plural' },
};

const ENGLISH: ProtocolLocalization = { defaultLocale: 'en', locales: ['en'] };

type Saved = { item?: LocalizedString };

function ItemField({
  initialValue,
  declaration,
}: {
  initialValue?: LocalizedString;
  declaration: MessageArguments;
}) {
  const intl = useAppIntl();
  return (
    <Field
      name="item"
      label="List item"
      component={LocalizedMessageField}
      arguments={declaration}
      initialValue={initialValue}
      custom={localizedMessageValidation(declaration, intl)}
    />
  );
}

function renderItem(
  initialValue?: LocalizedString,
  localization: ProtocolLocalization = ENGLISH,
  declaration: MessageArguments = ARGUMENTS,
) {
  const saved: { current: Saved | undefined } = { current: undefined };
  render(
    <ProtocolLocalizationProvider localization={localization}>
      <Form
        onSubmit={(values: Saved) => {
          saved.current = values;
          return { success: true };
        }}
      >
        <ItemField initialValue={initialValue} declaration={declaration} />
        <button type="submit">Save</button>
      </Form>
    </ProtocolLocalizationProvider>,
  );
  return saved;
}

const MESSAGE =
  '{isYou, select, true {{missing, plural, one {Add your other parent} other {Add # parents}}} other {Parents of {name}}}';

/** The field's line of text, named by the field's label. */
const findLine = () => screen.findByRole('textbox', { name: 'List item' });

describe('LocalizedMessageField', () => {
  it('lists the versions of a text that is one choice, one labelled row each, with no pill to open', async () => {
    renderItem({ en: MESSAGE });

    const participant = await screen.findByRole('textbox', {
      name: 'About the participant',
    });
    const someoneElse = screen.getByRole('textbox', {
      name: 'About someone else',
    });
    expect(participant).toBeVisible();
    expect(someoneElse).toBeVisible();
    expect(someoneElse).toHaveTextContent('Parents of Name');
    const group = screen.getByRole('group', {
      name: 'Wording that changes with Participant or someone else',
    });
    expect(
      within(group).queryByRole('button', {
        name: 'Participant or someone else',
      }),
    ).toBeNull();
    // Nothing at this level to open or close; the pill that remains is the
    // one inside the version about the participant.
    expect(group.querySelector(':scope > [data-versions-pill]')).toBeNull();
    expect(group.querySelector(':scope > [aria-expanded]')).toBeNull();
  });

  it('reads a placeholder’s name in the interface’s language', async () => {
    renderItem({ en: 'Parents of {name}' });

    const line = await findLine();
    const name = await waitFor(() => {
      const found = line.querySelector(
        'data[data-attribute-type="placeholder"] [dir]',
      );
      if (found === null) throw new Error('No placeholder pill');
      return found;
    });
    expect(name).toHaveTextContent('Name');
    expect(name).toHaveAttribute('lang', 'en');
    expect(name).toHaveAttribute('dir', 'ltr');
  });

  it('lists the one version of a language that has one form of a number', async () => {
    renderItem(
      { zh: '{missing, plural, other {还需添加 # 位家长}}' },
      { defaultLocale: 'zh', locales: ['zh'] },
      { missing: { kind: 'plural' } },
    );

    const row = await screen.findByRole('textbox', { name: /^When it is/ });
    expect(row).toBeVisible();
    expect(row).toHaveTextContent('还需添加');
    expect(document.querySelector('[data-versions-pill]')).toBeNull();
  });

  it('folds the versions of a text that has words around them to a pill named for what they change with', async () => {
    renderItem({
      en: 'Parents of {name}: {isYou, select, true {yours} other {theirs}}',
    });

    const line = await findLine();
    // Folded, the pill says what the versions change with, then what they
    // can show.
    const pill = within(line).getByRole('button', {
      name: /^Participant or someone else/,
    });
    expect(pill).toBeVisible();
    expect(pill).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.queryByRole('textbox', { name: 'About the participant' }),
    ).toBeNull();
    // Only the text's own words and pills: no version per combination of
    // the setting's cases and numbers.
    expect(screen.getAllByRole('textbox', { hidden: false })).toHaveLength(1);
  });

  it('lists the versions inside a version that are the whole of it, naming each row by both cases', async () => {
    renderItem({ en: MESSAGE });

    // About the participant, the wording depends on the number of parents
    // missing: that is all of the version, so it is listed beneath it.
    const one = await screen.findByRole('textbox', {
      name: 'About the participant, When it is 1',
    });
    expect(one).toBeVisible();
    expect(one).toHaveTextContent('Add your other parent');
    expect(
      screen.getByRole('textbox', {
        name: 'About the participant, When it is 0, 2, 3, …',
      }),
    ).toBeVisible();
    // The version about someone else is words, so nothing is nested in it.
    expect(
      screen.queryByRole('textbox', { name: /^About someone else, / }),
    ).toBeNull();
    expect(document.querySelectorAll('[data-always-open]')).toHaveLength(2);
  });

  it('lists every level of a message that is a switch inside a switch inside a switch', async () => {
    renderItem(
      {
        en: '{named, select, true {{personIsYou, select, true {Are you still together with {partner}?} other {{partnerIsYou, select, true {Are you still together?} other {Are they still together with {partner}?}}}}} other {Are they still together?}}',
      },
      ENGLISH,
      {
        named: { kind: 'select', cases: ['true'] },
        personIsYou: { kind: 'select', cases: ['true'] },
        partnerIsYou: { kind: 'select', cases: ['true'] },
        partner: { kind: 'text' },
      },
    );

    // Three levels, each the whole of the version above it.
    await waitFor(() =>
      expect(document.querySelectorAll('[data-always-open]')).toHaveLength(3),
    );
    const rows = screen
      .getAllByRole('textbox')
      .filter((row) => row.hasAttribute('data-version'))
      .filter((row) => row.querySelector('[data-always-open]') === null);
    expect(rows).toHaveLength(4);
    for (const row of rows) expect(row).toBeVisible();
    // Each innermost row names all three cases it is the wording for.
    const names = rows.map((row) => row.getAttribute('aria-label'));
    expect(
      names.filter((name) => (name ?? '').split(', ').length === 3),
    ).toHaveLength(2);
  });

  it('shows a text without versions as one phrase, whatever the setting can choose by', async () => {
    renderItem({ en: 'Add parents' });

    const line = await findLine();
    expect(line).toHaveTextContent('Add parents');
    expect(within(line).queryAllByRole('button')).toHaveLength(0);
  });

  it('writes the text back as one message, keeping its versions', async () => {
    const user = userEvent.setup();
    const saved = renderItem({ en: MESSAGE });
    const line = await findLine();

    // jsdom puts the caret at the start of the line.
    await user.type(line, 'Now: ');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(saved.current?.item).toEqual({ en: `Now: ${MESSAGE}` });
    });
  });

  it('offers what the setting declares in the Attribute menu, a placeholder as a value and a choice or a number as wording', async () => {
    const user = userEvent.setup();
    renderItem({ en: 'Add parents' });
    await findLine();

    await user.click(screen.getByRole('button', { name: 'Attribute' }));
    const menu = await screen.findByRole('dialog', {
      name: 'Insert an attribute',
    });
    const groupOf = (heading: string) => {
      const group = within(menu).getByRole('group', { name: heading });
      return within(group)
        .getAllByRole('option')
        .map((option) => option.textContent);
    };
    expect(groupOf('Interview attributes')).toEqual([
      expect.stringContaining('Name'),
    ]);
    expect(groupOf('Dynamic attributes')).toEqual([
      expect.stringContaining('Parents missing'),
      expect.stringContaining('Participant or someone else'),
    ]);
  });

  it('inserts a placeholder from the Attribute menu, and from a typed {', async () => {
    const user = userEvent.setup();
    renderItem({ en: 'Parents of ' });
    const line = await findLine();

    await user.click(line);
    await user.click(screen.getByRole('button', { name: 'Attribute' }));
    await user.click(await screen.findByRole('option', { name: /^Name/ }));
    await waitFor(() =>
      expect(line.querySelectorAll('[data-inline-value="name"]')).toHaveLength(
        1,
      ),
    );

    await user.type(line, ' and {{');
    await user.click(await screen.findByRole('option', { name: /^Name/ }));
    await waitFor(() =>
      expect(line.querySelectorAll('[data-inline-value="name"]')).toHaveLength(
        2,
      ),
    );
    expect(line).not.toHaveTextContent('{');
  });

  it('inserts wording for each case from the Attribute menu', async () => {
    const user = userEvent.setup();
    renderItem({ en: 'Add parents' });
    const line = await findLine();

    await user.click(line);
    await user.click(screen.getByRole('button', { name: 'Attribute' }));
    await user.click(
      await screen.findByRole('option', {
        name: /^Participant or someone else/,
      }),
    );

    expect(
      await screen.findByRole('textbox', { name: 'About the participant' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: 'About someone else' }),
    ).toBeInTheDocument();
  });

  describe('inserting a switch from the Attribute menu', () => {
    /** The keys of the versions the field shows, in order. */
    const versionKeys = () =>
      screen
        .getAllByRole('textbox')
        .flatMap((row) => row.getAttribute('data-version') ?? []);

    const insert = async (locale: string, option: RegExp) => {
      const user = userEvent.setup();
      renderItem(
        { [locale]: 'Add parents' },
        { defaultLocale: locale, locales: [locale] },
        {
          kin: { kind: 'select', cases: ['aunt', 'uncle'] },
          missing: { kind: 'plural' },
        },
      );
      const line = await findLine();
      await user.click(line);
      await user.click(screen.getByRole('button', { name: 'Attribute' }));
      await user.click(await screen.findByRole('option', { name: option }));
      await waitFor(() => expect(versionKeys().length).toBeGreaterThan(0));
    };

    it.each([
      ['en', ['one', 'other']],
      ['ru', ['one', 'few', 'many', 'other']],
      ['ar', ['zero', 'one', 'two', 'few', 'many', 'other']],
    ])(
      'offers a version for each plural category of %s, and no other',
      async (locale, categories) => {
        await insert(locale, /^Parents missing/);
        expect(versionKeys()).toEqual(categories);
      },
    );

    it('offers a version for each declared case, then other', async () => {
      await insert('en', /^kin/);
      expect(versionKeys()).toEqual(['aunt', 'uncle', 'other']);
    });
  });

  describe('marking a required placeholder that the text leaves out', () => {
    const attributeButton = () =>
      screen.getByRole('button', { name: 'Attribute' });
    const openMenu = async (user: ReturnType<typeof userEvent.setup>) => {
      await user.click(attributeButton());
      return screen.findByRole('listbox');
    };

    it('marks it in the menu and on its button until it is put in', async () => {
      const user = userEvent.setup();
      renderItem({ en: 'Add parents for ' }, ENGLISH, {
        name: { kind: 'text', required: [{}] },
      });
      const line = await findLine();
      await user.click(line);

      expect(attributeButton()).toHaveAttribute('data-missing');
      expect(attributeButton()).toHaveAccessibleDescription(
        'This wording is missing something it requires',
      );
      const list = await openMenu(user);
      const option = within(list).getByRole('option', {
        name: /^Name, ?Required in this wording$/,
      });
      expect(option).toHaveAttribute('data-marked');
      expect(option).toHaveTextContent('Required in this wording');
      await user.click(option);

      await waitFor(() =>
        expect(line.querySelector('[data-inline-value]')).not.toBeNull(),
      );
      expect(attributeButton()).not.toHaveAttribute('data-missing');
      expect(attributeButton()).not.toHaveAccessibleDescription();
      const name = within(await openMenu(user)).getByRole('option', {
        name: /^Name/,
      });
      expect(name).not.toHaveAttribute('data-marked');
      expect(name).not.toHaveAccessibleName(/Required in this wording/);
      expect(name).not.toHaveTextContent('Required in this wording');
    });

    it('marks it only in a version that requires it', async () => {
      const user = userEvent.setup();
      renderItem(
        { en: '{isYou, select, true {Your parents} other {Their parents}}' },
        ENGLISH,
        {
          isYou: { kind: 'select', cases: ['true'] },
          name: { kind: 'text', required: [{ isYou: 'other' }] },
        },
      );

      await user.click(
        await screen.findByRole('textbox', { name: 'About the participant' }),
      );
      expect(attributeButton()).not.toHaveAttribute('data-missing');
      expect(
        within(await openMenu(user)).getByRole('option', { name: /^Name/ }),
      ).not.toHaveAttribute('data-marked');
      await user.keyboard('{Escape}');

      await user.click(
        screen.getByRole('textbox', { name: 'About someone else' }),
      );
      expect(attributeButton()).toHaveAttribute('data-missing');
      expect(
        within(await openMenu(user)).getByRole('option', { name: /^Name/ }),
      ).toHaveAttribute('data-marked');
    });
  });

  it('refuses a version left empty', async () => {
    const user = userEvent.setup();
    const saved = renderItem({
      en: '{isYou, select, true {} other {Parents of {name}}}',
    });
    await findLine();

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText(
        'Write something in every version of this wording.',
      ),
    ).toBeVisible();
    expect(saved.current).toBeUndefined();
  });

  it('removes the translation when the text is emptied', async () => {
    const user = userEvent.setup();
    const saved = renderItem({ en: 'Add parents' });

    await user.click(await findLine());
    await user.keyboard('{Control>}a{/Control}{Backspace}');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(saved.current).toBeDefined();
    });
    expect(saved.current?.item).toBeUndefined();
  });

  describe('with placeholders a translation must show', () => {
    // The original names everyone but the participant, and counts the
    // missing parents for everyone.
    const REQUIRED: MessageArguments = {
      isYou: { kind: 'select', cases: ['true'] },
      name: { kind: 'text', required: [{ isYou: 'other' }] },
      missing: {
        kind: 'plural',
        required: [{ isYou: 'true' }, { isYou: 'other' }],
      },
    };

    it('refuses a version that leaves one out, naming it and the version', async () => {
      const user = userEvent.setup();
      const saved = renderItem(
        {
          en: '{isYou, select, true {{missing, plural, one {Add your other parent} other {Add your # parents}}} other {{missing, plural, one {Add another parent for {name}} other {Add # parents}}}}',
        },
        ENGLISH,
        REQUIRED,
      );
      await findLine();

      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(
        await screen.findByText(
          /^This wording must include the attribute “Name” in the “About someone else · When “Parents missing” is .+” scenario\.$/,
        ),
      ).toBeVisible();
      expect(saved.current).toBeUndefined();
    });

    it('saves a translation that shows them where it must', async () => {
      const user = userEvent.setup();
      const saved = renderItem(
        {
          en: '{isYou, select, true {{missing, plural, one {Add your other parent} other {Add your # parents}}} other {{missing, plural, one {Add another parent for {name}} other {Add # parents for {name}}}}}',
        },
        ENGLISH,
        REQUIRED,
      );
      await findLine();

      await user.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(saved.current).toBeDefined();
      });
    });
  });
});

describe('LocalizedMessageVersionsSummary', () => {
  /** A value's pill, as `VariablePill` draws it. */
  const PILL = 'data[data-variable-pill-size]';

  it('shows each placeholder and each piece with versions as a pill, among the words', () => {
    render(
      <p data-testid="summary">
        <LocalizedMessageVersionsSummary
          message="Brothers and sisters of {name}: {isYou, select, true {yours} other {theirs}}"
          declaration={{
            isYou: { kind: 'select', cases: ['true'] },
            name: { kind: 'text' },
          }}
          locale="en"
        />
      </p>,
    );

    const summary = screen.getByTestId('summary');
    const pills = summary.querySelectorAll(PILL);
    expect(pills).toHaveLength(2);
    expect(pills[0]).toHaveAttribute('value', 'Name');
    expect(pills[0]).toHaveAttribute('data-attribute-type', 'placeholder');
    expect(pills[1]).toHaveAttribute('value', 'Participant or someone else');
    expect(summary).toHaveTextContent(
      'Brothers and sisters of Name: Participant or someone else',
    );
  });

  const summaryOf = (message: string, declaration: MessageArguments) => {
    render(
      <div data-testid="summary">
        <LocalizedMessageVersionsSummary
          message={message}
          declaration={declaration}
          locale="en"
        />
      </div>,
    );
    return screen.getByTestId('summary');
  };

  it('writes out a message that is one number, a labelled line for each version', () => {
    const summary = summaryOf(
      '{missing, plural, one {Add your other parent} other {Add # parents}}',
      { missing: { kind: 'plural' } },
    );

    const versions = summary.querySelectorAll('[data-version-summary]');
    expect([...versions].map((version) => version.textContent)).toEqual([
      'When it is 1Add your other parent',
      'When it is 0, 2, 3, …Add Parents missing parents',
    ]);
    // Nothing is folded to a pill but the number inside the words.
    expect(summary.querySelectorAll(PILL)).toHaveLength(1);
  });

  it('writes out a set that is the whole of a version, under that version', () => {
    const summary = summaryOf(MESSAGE, ARGUMENTS);

    expect(summary.querySelectorAll('[data-versions-summary]')).toHaveLength(2);
    expect(summary).toHaveTextContent('About the participant');
    expect(summary).toHaveTextContent('Add your other parent');
    expect(summary).toHaveTextContent('Parents of Name');
  });

  it('keeps a set among words a pill, at any depth', () => {
    const summary = summaryOf(
      '{isYou, select, true {Add parents {missing, plural, one {now} other {later}}} other {Parents of {name}}}',
      ARGUMENTS,
    );

    // The choice is the whole message, so it is written out; the number is
    // among words in its version, so it stays a pill.
    expect(summary.querySelectorAll('[data-versions-summary]')).toHaveLength(1);
    expect(
      summary.querySelector(`${PILL}[value="Parents missing"]`),
    ).not.toBeNull();
    expect(summary).not.toHaveTextContent('later');
  });
});
