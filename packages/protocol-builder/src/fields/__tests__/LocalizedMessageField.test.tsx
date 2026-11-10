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

  it('lists the versions of a text that is one number, labelled by the numbers they are for', async () => {
    renderItem(
      {
        en: '{missing, plural, one {Add your other parent} other {Add # parents}}',
      },
      ENGLISH,
      { missing: { kind: 'plural' } },
    );

    const one = await screen.findByRole('textbox', {
      name: 'When it is 1',
    });
    expect(one).toBeVisible();
    expect(one).toHaveTextContent('Add your other parent');
    expect(
      screen.getByRole('textbox', {
        name: 'When it is 0, 2, 3, …',
      }),
    ).toBeVisible();
    expect(document.querySelector('[data-versions-pill]')).toBeNull();
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
    const pill = within(line).getByRole('button', {
      name: 'Participant or someone else',
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

  it('offers what the setting declares in the insert menu', async () => {
    const user = userEvent.setup();
    renderItem({ en: 'Add parents' });
    await findLine();

    await user.click(
      screen.getByRole('button', { name: 'Inject piped text from this stage' }),
    );
    const options = await screen.findAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([
      'Participant or someone elseDifferent wording for each case',
      'Name',
      'Parents missingWording that fits the number',
    ]);
  });

  it('inserts wording for each case from the insert menu', async () => {
    const user = userEvent.setup();
    renderItem({ en: 'Add parents' });
    const line = await findLine();

    await user.click(line);
    await user.click(
      screen.getByRole('button', { name: 'Inject piped text from this stage' }),
    );
    const [option] = await screen.findAllByRole('option', {
      name: /Participant or someone else/,
    });
    if (option === undefined) throw new Error('Nothing offered');
    await user.click(option);

    expect(
      await screen.findByRole('textbox', { name: 'About the participant' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: 'About someone else' }),
    ).toBeInTheDocument();
  });

  it('refuses a version left empty', async () => {
    const user = userEvent.setup();
    const saved = renderItem({
      en: '{isYou, select, true {} other {Parents of {name}}}',
    });
    await findLine();

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('Write something in every version of this text.'),
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
          /^Include “Name” in this version: About someone else · When “Parents missing” is .+\.$/,
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
    const pills = summary.querySelectorAll('[data-token]');
    expect(pills).toHaveLength(2);
    expect(pills[0]).toHaveAttribute('data-token', 'name');
    expect(pills[0]).toHaveTextContent('Name');
    expect(pills[1]).toHaveAttribute('data-token', 'isYou');
    expect(pills[1]).toHaveTextContent('Participant or someone else');
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
    expect(summary.querySelectorAll('[data-token]')).toHaveLength(1);
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
    expect(summary.querySelector('[data-token="missing"]')).toHaveTextContent(
      'Parents missing',
    );
    expect(summary).not.toHaveTextContent('later');
  });
});
