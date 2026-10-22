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

describe('LocalizedMessageField', () => {
  it('shows one version per case and per plural category of the language', async () => {
    renderItem({ en: MESSAGE });

    const group = await screen.findByRole('group', { name: 'List item' });
    const versions = within(group).getAllByRole('textbox');
    // About the participant and about someone else, each for 1 and for the
    // other numbers English distinguishes.
    expect(versions.map((version) => version.textContent)).toEqual([
      'Add your other parent',
      'Add Parents missing parents',
      'Parents of Name',
      'Parents of Name',
    ]);
    expect(versions[0]).toHaveAccessibleName(
      'About the participant When “Parents missing” is 1',
    );
    expect(versions[3]).toHaveAccessibleName(
      'About someone else When “Parents missing” is 0, 2, 3, …',
    );
  });

  it('labels every version with numbers it is for, in a language whose plural forms begin past 1,000', async () => {
    renderItem(
      { fr: 'Ajoutez des parents' },
      {
        defaultLocale: 'fr',
        locales: ['fr'],
      },
    );

    const versions = await screen.findAllByRole('textbox');
    // French says "un million de parents": `many` begins at a million.
    expect(versions).toHaveLength(6);
    expect(versions[1]).toHaveAccessibleName(
      'About the participant When “Parents missing” is 1,000,000, 2,000,000, 3,000,000, …',
    );
  });

  it('writes the versions back as one message, keeping its placeholders', async () => {
    const user = userEvent.setup();
    const saved = renderItem({ en: MESSAGE });
    const versions = await screen.findAllByRole('textbox');

    // jsdom puts the caret at the start of the line.
    await user.type(versions[2]!, 'Now: ');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(saved.current?.item).toEqual({
        en: '{isYou, select, true {{missing, plural, one {Add your other parent} other {Add # parents}}} other {{missing, plural, one {Now: Parents of {name}} other {Parents of {name}}}}}',
      });
    });
  });

  it('writes versions that all read the same as one phrase', async () => {
    const user = userEvent.setup();
    const saved = renderItem({ en: 'Add parents' });
    const versions = await screen.findAllByRole('textbox');
    expect(versions).toHaveLength(4);

    for (const version of versions) {
      await user.type(version, '¡');
    }
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(saved.current?.item).toEqual({ en: '¡Add parents' });
    });
  });

  it('refuses some versions written and others empty', async () => {
    const user = userEvent.setup();
    const saved = renderItem({ en: 'Add parents' });
    const versions = await screen.findAllByRole('textbox');

    await user.click(versions[1]!);
    await user.keyboard('{Control>}a{/Control}{Backspace}');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText(
        'Write every version of this text, or leave them all empty.',
      ),
    ).toBeVisible();
    expect(saved.current).toBeUndefined();
  });

  it('removes the translation when every version is emptied', async () => {
    const user = userEvent.setup();
    const saved = renderItem({ en: 'Add parents' });

    for (const version of await screen.findAllByRole('textbox')) {
      await user.click(version);
      await user.keyboard('{Control>}a{/Control}{Backspace}');
    }
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(saved.current).toBeDefined();
    });
    expect(saved.current?.item).toBeUndefined();
  });

  it('offers the text and number placeholders, not the cases', async () => {
    renderItem({ en: 'Add parents' });

    await screen.findAllByRole('textbox');
    expect(
      screen.getAllByRole('button', { name: 'Insert “Name”' }),
    ).toHaveLength(4);
    expect(
      screen.getAllByRole('button', { name: 'Insert “Parents missing”' }),
    ).toHaveLength(4);
    expect(screen.queryByRole('button', { name: /isYou/ })).toBeNull();
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

    it('marks the placeholders a version must show and does not', async () => {
      renderItem({ en: 'Add # parents' }, ENGLISH, REQUIRED);

      await screen.findAllByRole('textbox');
      // Only the versions about someone else must name them; English "one"
      // is only 1, so no version for one parent must show the number.
      expect(
        screen.getAllByRole('button', {
          name: 'Insert “Name” (required in this text)',
        }),
      ).toHaveLength(2);
      expect(
        screen.getAllByRole('button', {
          name: 'Insert “Parents missing” (required in this text)',
        }),
      ).toHaveLength(2);
    });

    it('refuses a version that leaves one out, naming it and the version', async () => {
      const user = userEvent.setup();
      const saved = renderItem(
        {
          en: '{isYou, select, true {{missing, plural, one {Add your other parent} other {Add your # parents}}} other {{missing, plural, one {Add another parent for {name}} other {Add # parents}}}}',
        },
        ENGLISH,
        REQUIRED,
      );
      await screen.findAllByRole('textbox');

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
      await screen.findAllByRole('textbox');

      await user.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(saved.current).toBeDefined();
      });
    });
  });
});

describe('LocalizedMessageVersionsSummary', () => {
  it('shows each placeholder as a pill with its label, among the words', () => {
    render(
      <p data-testid="summary">
        <LocalizedMessageVersionsSummary
          message="{isYou, select, true {Your brothers and sisters} other {Brothers and sisters of {name}}}"
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
    expect(pills).toHaveLength(1);
    expect(pills[0]).toHaveAttribute('data-token', 'name');
    expect(pills[0]).toHaveTextContent('Name');
    expect(summary).toHaveTextContent('Brothers and sisters of Name');
    expect(summary).not.toHaveTextContent('[Name]');
  });
});
