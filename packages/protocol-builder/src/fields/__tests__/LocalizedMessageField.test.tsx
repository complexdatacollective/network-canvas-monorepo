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
  it('shows the text as one line, its versions folded to a pill named for what they change with', async () => {
    renderItem({ en: MESSAGE });

    const line = await findLine();
    expect(
      within(line).getByRole('button', { name: 'Participant or someone else' }),
    ).toBeVisible();
    // Only the text's own words and pills: no version per combination of
    // the setting's cases and numbers.
    expect(screen.getAllByRole('textbox', { hidden: false })).toHaveLength(1);
  });

  it('opens the versions the text has, each labelled with its case, holding the versions inside them', async () => {
    const user = userEvent.setup();
    renderItem({ en: MESSAGE });

    const line = await findLine();
    await user.click(
      within(line).getByRole('button', { name: 'Participant or someone else' }),
    );

    const participant = await screen.findByRole('textbox', {
      name: 'About the participant',
    });
    const someoneElse = screen.getByRole('textbox', {
      name: 'About someone else',
    });
    // The version about the participant fits its words to the number of
    // parents missing; the other names the person.
    expect(
      within(participant).getByRole('button', { name: 'Parents missing' }),
    ).toBeInTheDocument();
    expect(someoneElse).toHaveTextContent('Parents of Name');
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
});
