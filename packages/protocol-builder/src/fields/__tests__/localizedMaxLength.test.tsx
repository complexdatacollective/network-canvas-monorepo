import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import Form from '@codaco/fresco-ui/form/Form';
import {
  escapeMessageText,
  type LocalizedString,
} from '@codaco/protocol-validation';

import { ProtocolLocalizationProvider } from '../../localization/ProtocolLocalization.tsx';
import { localizedMaxLength } from '../localizedMaxLength.ts';
import { LocalizedInputField } from '../LocalizedStringField.tsx';

const LIMIT = 50;
const TOO_LONG = 'Enter at most 50 characters.';

type Saved = { title?: LocalizedString };

function LimitedTitle({ initialValue }: { initialValue: LocalizedString }) {
  const intl = useAppIntl();
  return (
    <Field
      name="title"
      label="Title"
      component={LocalizedInputField}
      initialValue={initialValue}
      custom={localizedMaxLength(LIMIT, intl)}
    />
  );
}

function renderTitle(initialValue: LocalizedString) {
  const saved: { current: Saved | undefined } = { current: undefined };
  render(
    <ProtocolLocalizationProvider
      localization={{ defaultLocale: 'en', locales: ['en', 'es'] }}
    >
      <Form
        onSubmit={(values: Saved) => {
          saved.current = values;
          return { success: true };
        }}
      >
        <LimitedTitle initialValue={initialValue} />
        <button type="submit">Save</button>
      </Form>
    </ProtocolLocalizationProvider>,
  );
  return saved;
}

describe('localizedMaxLength', () => {
  it('saves translations that are each within the limit', async () => {
    const user = userEvent.setup();
    const saved = renderTitle({ en: 'a'.repeat(LIMIT), es: 'b'.repeat(LIMIT) });

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(saved.current).toBeDefined());
    expect(screen.queryByText(TOO_LONG)).not.toBeInTheDocument();
  });

  it('refuses a translation over the limit although the language being edited is within it', async () => {
    const user = userEvent.setup();
    const saved = renderTitle({
      en: 'Short enough',
      es: 'b'.repeat(LIMIT + 1),
    });

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText(TOO_LONG)).toBeInTheDocument();
    expect(saved.current).toBeUndefined();
  });

  it('refuses the language being edited when it is the one over the limit', async () => {
    const user = userEvent.setup();
    const saved = renderTitle({ en: 'a'.repeat(LIMIT + 1), es: 'Corto' });

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText(TOO_LONG)).toBeInTheDocument();
    expect(saved.current).toBeUndefined();
  });

  it('counts the text a researcher typed rather than the message stored for it', async () => {
    const user = userEvent.setup();
    const typed = "{'".repeat(LIMIT / 2);
    expect(escapeMessageText(typed).length).toBeGreaterThan(LIMIT);
    const saved = renderTitle({ en: escapeMessageText(typed) });

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(saved.current).toBeDefined());
    expect(screen.queryByText(TOO_LONG)).not.toBeInTheDocument();
  });
});
