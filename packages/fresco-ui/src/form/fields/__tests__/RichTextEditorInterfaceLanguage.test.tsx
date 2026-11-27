import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { defineAppLocales } from '@codaco/app-i18n/locales';
import { AppI18nProvider } from '@codaco/app-i18n/react';

import RichTextEditorField from '../RichTextEditor';
import { doc, paragraph } from './richTextEditorField';

const locales = defineAppLocales([
  { locale: 'en', label: 'English', direction: 'ltr' },
  { locale: 'ar', label: 'العربية', direction: 'rtl' },
]);

/**
 * The field as a host draws it for text in one language (`text`), in an
 * interface in another (`interfaceLocale`): inside a region that says the
 * text's language, as protocol-builder's `LocalizedStringField` does.
 */
const renderIn = (
  interfaceLocale: 'en' | 'ar',
  text: Readonly<{ lang: string; dir: 'ltr' | 'rtl' }>,
  props: Partial<ComponentProps<typeof RichTextEditorField>> = {},
) =>
  render(
    <AppI18nProvider locale={interfaceLocale} locales={locales}>
      <div lang={text.lang} dir={text.dir} data-testid="region">
        <RichTextEditorField
          id="content"
          name="content"
          aria-label="Content"
          changeMode="input"
          value={doc(paragraph('Hello'))}
          onChange={vi.fn()}
          {...props}
        />
      </div>
    </AppI18nProvider>,
  );

const ENGLISH_TEXT = { lang: 'en-US', dir: 'ltr' } as const;
const ARABIC_TEXT = { lang: 'ar', dir: 'rtl' } as const;

// The `lang` and `dir` the browser and a screen reader apply to an element:
// its own, or the nearest ancestor's.
const languageOf = (element: Element) => ({
  lang: element.closest('[lang]')?.getAttribute('lang'),
  dir: element.closest('[dir]')?.getAttribute('dir'),
});

const toolbar = () => within(screen.getByRole('toolbar'));
const textStyleLabel = () => {
  const trigger = toolbar().getByRole('button', { name: /^Text style: / });
  const label = within(trigger).getByText('Paragraph');
  return { trigger, label };
};

describe('interface words in the toolbar of text in another language', () => {
  it('the text style says the interface’s language, not the text’s', async () => {
    renderIn('ar', ENGLISH_TEXT);
    await screen.findByRole('textbox', { name: 'Content' });

    expect(languageOf(textStyleLabel().label)).toEqual({
      lang: 'ar',
      dir: 'rtl',
    });
  });

  it('the text style says an English interface’s language over Arabic text', async () => {
    renderIn('en', ARABIC_TEXT);
    await screen.findByRole('textbox', { name: 'Content' });

    expect(languageOf(textStyleLabel().label)).toEqual({
      lang: 'en',
      dir: 'ltr',
    });
  });

  it('keeps the text style’s screen-reader prefix in English', async () => {
    renderIn('ar', ENGLISH_TEXT);
    await screen.findByRole('textbox', { name: 'Content' });

    const prefix = within(textStyleLabel().trigger).getByText('Text style:');
    expect(prefix).toHaveAttribute('lang', 'en');
  });
});

describe('the placeholder of text in another language', () => {
  const emptyParagraph = async () => {
    const editor = await screen.findByRole('textbox', { name: 'Content' });
    const first = editor.querySelector('p');
    if (first === null) throw new Error('the editor holds no paragraph');
    return { editor, first };
  };

  it('is set in the interface’s language while the text is empty', async () => {
    renderIn('ar', ENGLISH_TEXT, {
      value: doc(),
      placeholder: 'Type your page content...',
    });
    const { first } = await emptyParagraph();

    expect(first).toHaveAttribute('data-placeholder');
    expect(first).toHaveAttribute('lang', 'ar');
  });

  it('leaves what is typed in the text’s language', async () => {
    const user = userEvent.setup();
    renderIn('ar', ENGLISH_TEXT, {
      value: doc(),
      placeholder: 'Type your page content...',
    });
    const { editor } = await emptyParagraph();

    await user.click(editor);
    await user.keyboard('Hi');

    await waitFor(() => expect(editor).toHaveTextContent('Hi'));
    const first = editor.querySelector('p');
    expect(first).not.toHaveAttribute('lang');
    expect(first && languageOf(first).lang).toBe('en-US');
  });

  it('does not mark text that is not empty', async () => {
    renderIn('ar', ENGLISH_TEXT, {
      placeholder: 'Type your page content...',
    });
    const { first } = await emptyParagraph();

    expect(first).toHaveTextContent('Hello');
    expect(first).not.toHaveAttribute('lang');
  });
});
