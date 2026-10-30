import { render } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getLocaleMetadata,
  suppliedStageText,
} from '@codaco/protocol-validation';

import { InterviewI18nProvider } from '../../i18n/InterviewI18nProvider';
import {
  localizedMessageParts,
  ProtocolLocalizationProvider,
  useContentLocaleIn,
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
    onLocalePreferenceChange: vi.fn(),
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
  children,
}: {
  props: ProviderProps;
  children: ReactNode;
}) {
  return (
    <InterviewI18nProvider>
      <ProtocolLocalizationProvider {...props}>
        {children}
      </ProtocolLocalizationProvider>
    </InterviewI18nProvider>
  );
}

function renderLocale(props: ProviderProps) {
  const rendered: ProtocolLocale[] = [];
  const onRender = (value: ProtocolLocale) => rendered.push(value);
  const view = render(
    <Harness props={props}>
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
        <Harness props={next}>
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
        localeOptions: localeOptions.toReversed(),
      }),
    );

    expect(latest().options.map(({ locale }) => locale)).toEqual([
      'en',
      'es',
      'ar',
    ]);
  });

  it('collates the language names for the language the interview shows', () => {
    const names = (localePreference: string) =>
      renderLocale(
        makeProps({
          localization: { defaultLocale: 'en', locales: ['en', 'es'] },
          localeOptions: [
            { locale: 'en', label: 'ña', direction: 'ltr' },
            { locale: 'es', label: 'nb', direction: 'ltr' },
          ],
          localePreference,
        }),
      )
        .latest()
        .options.map(({ label }) => label);

    // Spanish sorts ñ as a letter of its own, after n; English sorts it as n.
    expect(names('en')).toEqual(['ña', 'nb']);
    expect(names('es')).toEqual(['nb', 'ña']);
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

describe('localizedMessageParts', () => {
  const shown = (parts: ReturnType<typeof localizedMessageParts>) =>
    parts.map((part) => (typeof part === 'string' ? part : part.text)).join('');

  // A Japanese protocol holds the English minimum notice Network Canvas
  // supplies, having no Japanese wording for it. By Japanese plural rules
  // every count is "other", which would read "1 items".
  it('chooses the plural of Network Canvas’s English wording by English rules, whatever language holds it', () => {
    const [notice] = suppliedStageText('NameGenerator', {
      defaultLocale: 'ja',
      locales: ['ja'],
    }).filter(({ path }) => path[0] === 'minNodesNotice');
    const english = notice?.value.ja;
    if (english === undefined) throw new Error('No minimum notice');

    expect(shown(localizedMessageParts(english, 'ja', { count: 1 }))).toBe(
      'You must create at least 1 item before you can continue.',
    );
  });

  it('joins a list in Network Canvas’s English wording with English words, whatever language holds it', () => {
    const [notice] = suppliedStageText('FamilyPedigree', {
      defaultLocale: 'ja',
      locales: ['ja'],
    }).filter(({ path }) => path[1] === 'standInPlaceTaken');
    const english = notice?.value.ja;
    if (english === undefined) throw new Error('No hint with a list');

    expect(
      shown(
        localizedMessageParts(english, 'ja', {
          anchorIsYou: 'true',
          count: 2,
          names: ['Ava', 'Ben'],
        }),
      ),
    ).toBe(
      'Ava and Ben have the same unnamed parent as you, so this person becomes their parent too.',
    );
  });

  it('chooses the plural of a researcher’s message by the rules of the language holding it', () => {
    expect(
      shown(
        localizedMessageParts(
          '{count, plural, one {# item} other {# items}}',
          'ja',
          {
            count: 1,
          },
        ),
      ),
    ).toBe('1 items');
  });
});

describe('useContentLocaleIn', () => {
  function HostLocaleProbe({
    onRender,
  }: {
    onRender: (locale: string) => void;
  }) {
    onRender(useContentLocaleIn(['en', 'es', 'fr'], 'en'));
    return null;
  }

  const hostLocaleFor = (locales: string[], requestedLocales: string[]) => {
    const rendered: string[] = [];
    render(
      <Harness
        props={makeProps({
          localization: { defaultLocale: locales[0]!, locales },
          localeOptions: locales.map((locale) => getLocaleMetadata(locale)),
          requestedLocales,
        })}
      >
        <HostLocaleProbe onRender={(locale) => rendered.push(locale)} />
      </Harness>,
    );
    return rendered.at(-1);
  };

  it('fits a regional protocol language to the host language it falls under', () => {
    expect(hostLocaleFor(['en', 'es-MX'], ['es-MX'])).toBe('es');
  });

  it('falls back when the host has no fitting language', () => {
    expect(hostLocaleFor(['en', 'hu'], ['hu'])).toBe('en');
  });
});
