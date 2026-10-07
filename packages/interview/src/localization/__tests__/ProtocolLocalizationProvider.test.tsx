import { render } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getLocaleMetadata } from '@codaco/protocol-validation';

import { InterviewI18nProvider } from '../../i18n/InterviewI18nProvider';
import {
  ProtocolLocalizationProvider,
  useLocalizedString,
  useProtocolLocale,
} from '../ProtocolLocalizationProvider';

type ProviderProps = Omit<
  ComponentProps<typeof ProtocolLocalizationProvider>,
  'children'
>;
type ProtocolLocale = ReturnType<typeof useProtocolLocale>;
type LocalizedValue = Parameters<typeof useLocalizedString>[0];
type ResolvedValue = ReturnType<typeof useLocalizedString>;

const localization = { defaultLocale: 'en', locales: ['en', 'es', 'ar'] };
const localeOptions = localization.locales.map((locale) =>
  getLocaleMetadata(locale),
);

function makeProps(overrides: Partial<ProviderProps> = {}): ProviderProps {
  return {
    localization,
    localeOptions,
    requestedLocales: [],
    localePreference: null,
    recordedLocale: null,
    onLocalePreferenceChange: vi.fn(),
    onLocaleRecorded: vi.fn(),
    ...overrides,
  };
}

function LocaleProbe({
  onRender,
}: {
  onRender: (value: ProtocolLocale) => void;
}) {
  onRender(useProtocolLocale());
  return null;
}

function StringProbe({
  value,
  onRender,
}: {
  value: LocalizedValue;
  onRender: (resolved: ResolvedValue) => void;
}) {
  onRender(useLocalizedString(value));
  return null;
}

function Harness({
  props,
  interfaceLocales = ['en'],
  children,
}: {
  props: ProviderProps;
  interfaceLocales?: readonly string[];
  children: ReactNode;
}) {
  return (
    <InterviewI18nProvider requestedLocale={interfaceLocales}>
      <ProtocolLocalizationProvider {...props}>
        {children}
      </ProtocolLocalizationProvider>
    </InterviewI18nProvider>
  );
}

function renderLocale(
  props: ProviderProps,
  interfaceLocales?: readonly string[],
) {
  const rendered: ProtocolLocale[] = [];
  const onRender = (value: ProtocolLocale) => rendered.push(value);
  const view = render(
    <Harness props={props} interfaceLocales={interfaceLocales}>
      <LocaleProbe onRender={onRender} />
    </Harness>,
  );
  return {
    latest: () => {
      const value = rendered.at(-1);
      if (!value) throw new Error('The probe never rendered');
      return value;
    },
    rerender: (next: ProviderProps) =>
      view.rerender(
        <Harness props={next} interfaceLocales={interfaceLocales}>
          <LocaleProbe onRender={onRender} />
        </Harness>,
      ),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ProtocolLocalizationProvider', () => {
  it('shows the stated preference whatever the browser prefers', () => {
    const { latest } = renderLocale(
      makeProps({ localePreference: 'es', requestedLocales: ['ar'] }),
    );

    expect(latest().locale).toBe('es');
  });

  it("matches the browser's languages one at a time, in order", () => {
    const { latest } = renderLocale(
      makeProps({ requestedLocales: ['es-MX', 'en'] }),
    );

    expect(latest().locale).toBe('es');
  });

  it('falls back to the default language when nothing requested is declared', () => {
    const { latest } = renderLocale(makeProps({ requestedLocales: ['ja'] }));

    expect(latest().locale).toBe('en');
    expect(latest().metadata).toEqual(getLocaleMetadata('en'));
  });

  it("chooses again when the browser's languages change and nothing was stated", () => {
    const { latest, rerender } = renderLocale(
      makeProps({ requestedLocales: ['es'] }),
    );
    expect(latest().locale).toBe('es');

    rerender(makeProps({ requestedLocales: ['ar'] }));

    expect(latest().locale).toBe('ar');
    expect(latest().metadata.direction).toBe('rtl');
  });

  it('records the language it shows once, and not when the session already has it', () => {
    const onLocaleRecorded = vi.fn();
    const { rerender } = renderLocale(
      makeProps({ requestedLocales: ['es'], onLocaleRecorded }),
    );
    expect(onLocaleRecorded).toHaveBeenCalledTimes(1);
    expect(onLocaleRecorded).toHaveBeenCalledWith('es');

    rerender(
      makeProps({
        requestedLocales: ['es'],
        recordedLocale: 'es',
        onLocaleRecorded,
      }),
    );
    expect(onLocaleRecorded).toHaveBeenCalledTimes(1);

    const onResumedRecorded = vi.fn();
    renderLocale(
      makeProps({
        requestedLocales: ['ar'],
        recordedLocale: 'ar',
        onLocaleRecorded: onResumedRecorded,
      }),
    );
    expect(onResumedRecorded).not.toHaveBeenCalled();
  });

  it('refuses locale options that do not describe each declared locale once', () => {
    vi.spyOn(console, 'error').mockImplementation(vi.fn());

    expect(() =>
      renderLocale(makeProps({ localeOptions: localeOptions.slice(0, 2) })),
    ).toThrow(
      "localeOptions must describe each of the protocol's declared locales once (declared: en, es, ar; received: en, es)",
    );
    expect(() =>
      renderLocale(
        makeProps({
          localeOptions: [
            ...localeOptions.slice(0, 2),
            getLocaleMetadata('fr'),
          ],
        }),
      ),
    ).toThrow(/received: en, es, fr/);
    expect(() =>
      renderLocale(
        makeProps({
          localeOptions: [...localeOptions, getLocaleMetadata('es')],
        }),
      ),
    ).toThrow(/received: en, es, ar, es/);
  });

  it('accepts locale options in any order and lists them alphabetically by name', () => {
    const { latest } = renderLocale(
      makeProps({
        localization: { defaultLocale: 'en', locales: ['ar', 'es', 'en'] },
        localeOptions: [...localeOptions].reverse(),
      }),
    );

    expect(latest().options.map(({ locale }) => locale)).toEqual([
      'en',
      'es',
      'ar',
    ]);
  });

  it('collates the language names for the interface language', () => {
    const names = (interfaceLocales: readonly string[]) =>
      renderLocale(
        makeProps({
          localization: { defaultLocale: 'en', locales: ['en', 'es'] },
          localeOptions: [
            { locale: 'en', label: 'ña', direction: 'ltr' },
            { locale: 'es', label: 'nb', direction: 'ltr' },
          ],
        }),
        interfaceLocales,
      )
        .latest()
        .options.map(({ label }) => label);

    // Spanish sorts ñ as a letter of its own, after n; English sorts it as n.
    expect(names(['en'])).toEqual(['ña', 'nb']);
    expect(names(['es'])).toEqual(['nb', 'ña']);
  });

  it('names the unspecified language in the interface language', () => {
    const { latest } = renderLocale(
      makeProps({
        localization: { defaultLocale: 'und', locales: ['und'] },
        localeOptions: [getLocaleMetadata('und')],
      }),
      ['es'],
    );

    expect(latest().options).toEqual([
      { locale: 'und', label: 'Idioma no especificado', direction: 'ltr' },
    ]);
    expect(latest().metadata.label).toBe('Idioma no especificado');
  });

  it('only accepts a declared locale as a stated preference', () => {
    const onLocalePreferenceChange = vi.fn();
    const { latest } = renderLocale(makeProps({ onLocalePreferenceChange }));

    latest().setLocale('ar');
    expect(onLocalePreferenceChange).toHaveBeenCalledWith('ar');

    expect(() => latest().setLocale('fr')).toThrow(
      '"fr" is not one of the protocol\'s declared locales',
    );
    expect(onLocalePreferenceChange).toHaveBeenCalledTimes(1);
  });

  it('is only available inside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(vi.fn());

    expect(() => render(<LocaleProbe onRender={vi.fn()} />)).toThrow(
      /only available inside a ProtocolLocalizationProvider/,
    );
  });
});

describe('useLocalizedString', () => {
  function resolve(value: LocalizedValue, props: ProviderProps) {
    const resolved: ResolvedValue[] = [];
    render(
      <Harness props={props}>
        <StringProbe value={value} onRender={(next) => resolved.push(next)} />
      </Harness>,
    );
    const latest = resolved.at(-1);
    if (!latest) throw new Error('The probe never rendered');
    return latest;
  }

  it('formats the message in the language the text is written in', () => {
    const resolved = resolve(
      {
        en: "Write '{'name'}' as shown",
        es: "Escribe '{'nombre'}' tal cual<br>",
      },
      makeProps({ requestedLocales: ['es-MX'] }),
    );

    expect(resolved).toMatchObject({
      text: 'Escribe {nombre} tal cual<br>',
      locale: 'es',
      usedFallback: false,
    });
  });

  it('falls back to the default language and reports its language', () => {
    const resolved = resolve(
      { en: "Only '{'English'}'" },
      makeProps({ requestedLocales: ['ar'] }),
    );

    expect(resolved).toMatchObject({
      text: 'Only {English}',
      locale: 'en',
      selectedLocale: 'ar',
      usedFallback: true,
      matchedBy: 'default',
    });
  });

  it("falls back to the browser's other languages before the default", () => {
    const resolved = resolve(
      { en: 'Hello', es: 'Hola' },
      makeProps({ requestedLocales: ['ar', 'fr', 'es-MX', 'en'] }),
    );

    expect(resolved).toMatchObject({
      text: 'Hola',
      locale: 'es',
      selectedLocale: 'ar',
      usedFallback: true,
      matchedBy: 'requested',
    });
  });

  it("keeps the browser's languages as fallbacks after a stated preference", () => {
    const resolved = resolve(
      { en: 'Hello', es: 'Hola' },
      makeProps({ localePreference: 'ar', requestedLocales: ['es', 'en'] }),
    );

    expect(resolved).toMatchObject({
      text: 'Hola',
      locale: 'es',
      selectedLocale: 'ar',
      matchedBy: 'requested',
    });
  });
});
