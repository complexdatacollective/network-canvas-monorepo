import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import Form from '@codaco/fresco-ui/form/Form';

import type { ProtocolLocalization } from '../../localization/localizedText.ts';
import { ProtocolLocalizationProvider } from '../../localization/ProtocolLocalization.tsx';
import { PromptTextField } from '../PromptTextField.tsx';

/**
 * The question box is a rich-text editor, which ProseMirror cannot be driven
 * through in jsdom; a plain input carrying the same value keeps this test about
 * which translation an edit writes, and the rich text field has its own test.
 */
vi.mock('../RichTextField.tsx', () => ({
  default: ({
    id,
    name,
    value,
    onChange,
  }: Readonly<{
    id?: string;
    name?: string;
    value?: unknown;
    onChange?: (next: string) => void;
  }>) => (
    <input
      id={id}
      name={name}
      value={typeof value === 'string' ? value : ''}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
}));

const ENGLISH_AND_SPANISH: ProtocolLocalization = {
  defaultLocale: 'en',
  locales: ['en', 'es'],
};

describe('PromptTextField', () => {
  it('writes the question in the language being edited and leaves the other translations alone', async () => {
    const user = userEvent.setup();
    let saved: unknown;
    render(
      <ProtocolLocalizationProvider localization={ENGLISH_AND_SPANISH}>
        <Form
          onSubmit={(values) => {
            saved = values;
            return { success: true };
          }}
        >
          <PromptTextField
            item={{
              text: { en: 'Who do you know?', es: '¿A quién conoces?' },
            }}
            placeholder="Who do these two people know in common?"
          />
          <button type="submit">Save</button>
        </Form>
      </ProtocolLocalizationProvider>,
    );

    await user.click(screen.getByRole('button', { name: /Editing language/ }));
    await user.click(
      await screen.findByRole('menuitemradio', { name: /^español/ }),
    );
    const question = screen.getByRole('textbox', { name: /^Prompt text/ });
    expect(question).toHaveValue('¿A quién conoces?');

    await user.clear(question);
    await user.type(question, '¿A quién conoces bien?');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(saved).toEqual({
        text: { en: 'Who do you know?', es: '¿A quién conoces bien?' },
      }),
    );
  });
});
