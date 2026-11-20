import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { defineAppLocales } from '@codaco/app-i18n/locales';
import { AppI18nProvider } from '@codaco/app-i18n/react';
import type { RichTextAssetBlockKind } from '@codaco/fresco-ui/form/fields/RichTextEditor';
import { assetBlockAttributes } from '@codaco/fresco-ui/testing/assetBlock';

import ResourceFailureNotice from '../../../resources/components/ResourceFailureNotice.tsx';
import { createAssetBlockImages } from '../assetBlockImages.tsx';
import { messages } from '../assetBlockMessages.ts';
import { createAssetBlockView } from '../AssetBlockView.tsx';

const locales = defineAppLocales([
  { locale: 'en', label: 'English', direction: 'ltr' },
  { locale: 'ar', label: 'العربية', direction: 'rtl' },
]);

type Language = Readonly<{ lang: string; dir: 'ltr' | 'rtl' }>;
const ENGLISH_TEXT: Language = { lang: 'en-US', dir: 'ltr' };
const ARABIC_TEXT: Language = { lang: 'ar', dir: 'rtl' };

/**
 * `children` in an interface in `interfaceLocale`, inside a region that says
 * the language of the text being written (`text`), as the stage editor's
 * field and the translation table's cell do.
 */
const drawIn = (
  interfaceLocale: 'en' | 'ar',
  text: Language,
  children: ReactNode,
) =>
  render(
    <AppI18nProvider locale={interfaceLocale} locales={locales}>
      <div lang={text.lang} dir={text.dir}>
        {children}
      </div>
    </AppI18nProvider>,
  );

// The `lang` and `dir` that apply to an element: its own, or the nearest
// ancestor's.
const languageOf = (element: Element) => ({
  lang: element.closest('[lang]')?.getAttribute('lang'),
  dir: element.closest('[dir]')?.getAttribute('dir'),
});

const UNUSABLE = messages.unusable.defaultMessage;

const viewOf = (
  known: Readonly<{ kind: RichTextAssetBlockKind; name: string }> | undefined,
) =>
  createAssetBlockView({
    useAsset: () => known,
    Preview: ({ name }) => <div data-testid="preview" data-name={name} />,
  });

const viewProps = {
  attributes: assetBlockAttributes({ description: 'A harbour at dawn' }),
  selected: true,
  editable: true,
  active: true,
  update: vi.fn(),
  remove: vi.fn(),
  returnToText: vi.fn(),
};

describe('a block in text written in another language', () => {
  it('says a file it cannot show in the interface’s language', () => {
    const View = viewOf(undefined);
    drawIn('ar', ENGLISH_TEXT, <View {...viewProps} />);

    expect(languageOf(screen.getByText(UNUSABLE))).toEqual({
      lang: 'ar',
      dir: 'rtl',
    });
  });

  it('says it in an English interface over Arabic text', () => {
    const View = viewOf(undefined);
    drawIn('en', ARABIC_TEXT, <View {...viewProps} />);

    expect(languageOf(screen.getByText(UNUSABLE))).toEqual({
      lang: 'en',
      dir: 'ltr',
    });
  });

  it('takes its description in the text’s language, in settings standing outside the text', () => {
    const View = viewOf({ kind: 'image', name: 'harbour.png' });
    drawIn('ar', ENGLISH_TEXT, <View {...viewProps} />);

    const description = screen.getByRole('textbox');
    expect(description).toHaveValue('A harbour at dawn');
    expect(description).toHaveAttribute('lang', 'en-US');
    expect(description).toHaveAttribute('dir', 'ltr');
    // The settings stand over the page, not in the text: what they say
    // themselves is in the interface's language.
    const label = document.querySelector(`label[for="${description.id}"]`);
    expect(label).not.toBeNull();
    expect(label && languageOf(label).lang).toBe('ar');
  });

  it('takes an Arabic description from an English interface', () => {
    const View = viewOf({ kind: 'image', name: 'harbour.png' });
    drawIn('en', ARABIC_TEXT, <View {...viewProps} />);

    const description = screen.getByRole('textbox');
    expect(description).toHaveAttribute('lang', 'ar');
    expect(description).toHaveAttribute('dir', 'rtl');
  });
});

describe('a block read in a cell or summary of another language', () => {
  const { Block } = createAssetBlockImages((assetId) =>
    assetId === 'a1' ? { kind: 'image', name: 'harbour.png' } : undefined,
  );

  it('says a file it cannot show in the interface’s language', () => {
    drawIn('ar', ENGLISH_TEXT, <Block url="asset:zz" alt="Gone" />);

    expect(languageOf(screen.getByText(UNUSABLE))).toEqual({
      lang: 'ar',
      dir: 'rtl',
    });
  });

  it('leaves the description in the text’s language', () => {
    drawIn('ar', ENGLISH_TEXT, <Block url="asset:a1" alt="A map" />);

    expect(languageOf(screen.getByText('A map'))).toEqual(ENGLISH_TEXT);
  });
});

describe('a file that could not be fetched, in text of another language', () => {
  it('says why in the interface’s language', () => {
    drawIn(
      'ar',
      ENGLISH_TEXT,
      <ResourceFailureNotice
        failure={{
          reason: 'unavailable',
          message: 'The file store is not reachable.',
          retryable: true,
        }}
        onRetry={vi.fn()}
      />,
    );

    expect(
      languageOf(screen.getByText('The file store is not reachable.')),
    ).toEqual({ lang: 'ar', dir: 'rtl' });
  });
});
