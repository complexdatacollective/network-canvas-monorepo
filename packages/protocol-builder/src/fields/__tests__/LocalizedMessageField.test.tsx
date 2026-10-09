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
  localizedMessageValidation,
} from '../LocalizedMessageField.tsx';

const ARGUMENTS: MessageArguments = {
  isYou: { kind: 'select', cases: ['true'] },
  name: { kind: 'text' },
  missing: { kind: 'plural' },
};

const ENGLISH: ProtocolLocalization = { defaultLocale: 'en', locales: ['en'] };

type Saved = { item?: LocalizedString };

function ItemField({ initialValue }: { initialValue?: LocalizedString }) {
  const intl = useAppIntl();
  return (
    <Field
      name="item"
      label="List item"
      component={LocalizedMessageField}
      arguments={ARGUMENTS}
      initialValue={initialValue}
      custom={localizedMessageValidation(ARGUMENTS, intl)}
    />
  );
}

function renderItem(initialValue?: LocalizedString) {
  const saved: { current: Saved | undefined } = { current: undefined };
  render(
    <ProtocolLocalizationProvider localization={ENGLISH}>
      <Form
        onSubmit={(values: Saved) => {
          saved.current = values;
          return { success: true };
        }}
      >
        <ItemField initialValue={initialValue} />
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
});
