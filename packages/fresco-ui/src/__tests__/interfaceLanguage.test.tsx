import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { defineAppLocales } from '@codaco/app-i18n/locales';
import { AppI18nProvider } from '@codaco/app-i18n/react';

import { interfaceLanguage, useInterfaceLanguage } from '../interfaceLanguage';
import type { PresentationalText } from '../PresentationalText';

const locales = defineAppLocales([
  { locale: 'en', label: 'English', direction: 'ltr' },
  { locale: 'ar', label: 'العربية', direction: 'rtl' },
]);

const arabic = { lang: 'ar', dir: 'rtl' } as const;

function Label({ label }: { label: PresentationalText }) {
  return (
    <span data-testid="label" {...useInterfaceLanguage(label)}>
      {typeof label === 'string' ? label : label.text}
    </span>
  );
}

/** A label in the Arabic interface, inside a protocol's English text. */
const inArabicInterface = (label: PresentationalText) =>
  render(
    <AppI18nProvider locale="ar" locales={locales}>
      <p lang="en" dir="ltr">
        <Label label={label} />
      </p>
    </AppI18nProvider>,
  );

describe('interfaceLanguage', () => {
  it('gives the interface’s words the interface’s language and direction', () => {
    expect(interfaceLanguage('اليوم', arabic)).toEqual(arabic);

    inArabicInterface('اليوم');
    const label = screen.getByTestId('label');
    expect(label).toHaveAttribute('lang', 'ar');
    expect(label).toHaveAttribute('dir', 'rtl');
  });

  it('lets a name someone wrote read in its own direction, in the text’s language', () => {
    // An English attribute called “team-b!” in the Arabic interface keeps its
    // “!” at its end, and a screen reader does not read it as Arabic.
    const name = { text: 'team-b!', dir: 'auto' } as const;
    expect(interfaceLanguage(name, arabic)).toEqual({ dir: 'auto' });

    inArabicInterface(name);
    const label = screen.getByTestId('label');
    expect(label).toHaveAttribute('dir', 'auto');
    expect(label).not.toHaveAttribute('lang');
  });
});
