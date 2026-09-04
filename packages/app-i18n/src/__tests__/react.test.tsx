// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { commonMessages } from '../common.ts';
import { defineAppLocales, pseudoAppLocale } from '../locales.ts';
import { defineMessages } from '../messages.ts';
import { AppI18nProvider, useAppIntl, useAppLocale } from '../react.tsx';

const registry = defineAppLocales([
  { locale: 'en', label: 'English', direction: 'ltr' },
  { locale: 'en-GB', label: 'English (UK)', direction: 'ltr' },
  { locale: 'ar', label: 'العربية', direction: 'rtl' },
]);

const messages = defineMessages({
  greeting: {
    id: 'demo.greeting',
    defaultMessage: 'Hello {name}',
    description: 'Test greeting.',
  },
  count: {
    id: 'demo.count',
    defaultMessage: '{count, plural, one {# result} other {# results}}',
    description: 'Test plural.',
  },
  guide: {
    id: 'demo.guide',
    defaultMessage: 'Read <link>the guide</link>',
    description: 'Test rich text.',
  },
});

function Greeting(props: { name: string }) {
  const intl = useAppIntl();
  return <p>{intl.formatMessage(messages.greeting, { name: props.name })}</p>;
}

function Count(props: { count: number }) {
  const intl = useAppIntl();
  return <p>{intl.formatMessage(messages.count, { count: props.count })}</p>;
}

describe('useAppIntl without a provider', () => {
  it('renders English defaults, plurals included', () => {
    render(
      <>
        <Greeting name="Ada" />
        <Count count={1} />
        <Count count={3} />
      </>,
    );
    expect(screen.getByText('Hello Ada')).toBeDefined();
    expect(screen.getByText('1 result')).toBeDefined();
    expect(screen.getByText('3 results')).toBeDefined();
  });

  it('renders common descriptors', () => {
    function Retry() {
      const intl = useAppIntl();
      return <button>{intl.formatMessage(commonMessages.retry)}</button>;
    }
    render(<Retry />);
    expect(screen.getByText('Try again')).toBeDefined();
  });
});

describe('AppI18nProvider', () => {
  it('serves catalog translations and falls back to defaults per message', () => {
    render(
      <AppI18nProvider
        locale="en-GB"
        locales={registry}
        messages={{ 'demo.greeting': 'Good day {name}' }}
      >
        <Greeting name="Ada" />
        <Count count={2} />
      </AppI18nProvider>,
    );
    expect(screen.getByText('Good day Ada')).toBeDefined();
    expect(screen.getByText('2 results')).toBeDefined();
  });

  it('writes and updates document lang and dir', () => {
    document.documentElement.lang = 'xx';
    document.documentElement.dir = '';
    const view = render(
      <AppI18nProvider locale="en-GB" locales={registry}>
        <Greeting name="Ada" />
      </AppI18nProvider>,
    );
    expect(document.documentElement.lang).toBe('en-GB');
    expect(document.documentElement.dir).toBe('ltr');

    view.rerender(
      <AppI18nProvider locale="ar" locales={registry}>
        <Greeting name="Ada" />
      </AppI18nProvider>,
    );
    expect(document.documentElement.lang).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');
  });

  it('writes lang and dir in the layout phase, before anything can paint', () => {
    // The oracle is the ordering, not the final value: a child's passive
    // effect runs after every layout effect and before the provider's own
    // passive effect. So what it observes is what the browser would have
    // painted — under a passive write it is still the document's old, LTR
    // state, which is the RTL flash this guards.
    document.documentElement.lang = 'xx';
    document.documentElement.dir = 'ltr';
    const painted: string[] = [];
    function Probe() {
      useEffect(() => {
        const root = document.documentElement;
        painted.push(`${root.lang}/${root.dir}`);
      }, []);
      return null;
    }
    render(
      <AppI18nProvider locale="ar" locales={registry}>
        <Probe />
      </AppI18nProvider>,
    );
    expect(painted).toEqual(['ar/rtl']);
  });

  it('renders an undeclared locale as the registry default rather than failing', () => {
    // The provider wraps the whole application, so a tag the registry does not
    // declare — a preference stored by a build that offered more locales, a
    // hand-edited mirror — has to degrade to a readable screen. Negotiation is
    // what guarantees a declared tag; this is the backstop for what bypasses
    // it, and `<html lang>` must describe what is actually on screen.
    document.documentElement.lang = 'xx';
    const view = render(
      <AppI18nProvider locale="fr-CA" locales={registry}>
        <Greeting name="Ada" />
      </AppI18nProvider>,
    );
    expect(view.container.textContent).toContain('Hello Ada');
    expect(document.documentElement.lang).toBe('en');
  });

  it('leaves the document alone when manageDocument is false', () => {
    document.documentElement.lang = 'xx';
    render(
      <AppI18nProvider locale="ar" locales={registry} manageDocument={false}>
        <Greeting name="Ada" />
      </AppI18nProvider>,
    );
    expect(document.documentElement.lang).toBe('xx');
  });

  it('exposes locale state and forwards setLocale to the host', () => {
    const onLocaleChange = vi.fn();
    function Switcher() {
      const { locale, direction, locales, setLocale } = useAppLocale();
      return (
        <button onClick={() => setLocale(null)}>
          {locale}:{direction}:{locales.length}
        </button>
      );
    }
    render(
      <AppI18nProvider
        locale="ar"
        locales={registry}
        onLocaleChange={onLocaleChange}
      >
        <Switcher />
      </AppI18nProvider>,
    );
    const button = screen.getByText('ar:rtl:3');
    button.click();
    expect(onLocaleChange).toHaveBeenCalledWith(null);
  });

  it('accents and expands output under the pseudo-locale', () => {
    render(
      <AppI18nProvider
        locale={pseudoAppLocale.locale}
        locales={[...registry, pseudoAppLocale]}
      >
        <Greeting name="Ada" />
      </AppI18nProvider>,
    );
    const paragraph = screen.getByText(/Héllö/);
    expect(paragraph.textContent).not.toBe('Hello Ada');
    expect(paragraph.textContent?.length ?? 0).toBeGreaterThan(
      'Hello Ada'.length,
    );
  });

  it('expands a choice by one arm, not by the number of arms', () => {
    // Arms are mutually exclusive, so summing them made a three-arm select
    // expand by roughly three times the intended third and clip layouts a
    // real translation would fit.
    function Choice(props: { g: string }) {
      const intl = useAppIntl();
      return (
        <p>
          {intl.formatMessage(
            {
              id: 'demo.choice',
              defaultMessage:
                '{g, select, male {He replied} female {She replied} other {They replied}}',
              description: 'Test select.',
            },
            { g: props.g },
          )}
        </p>
      );
    }
    const view = render(
      <AppI18nProvider
        locale={pseudoAppLocale.locale}
        locales={[...registry, pseudoAppLocale]}
      >
        <Choice g="male" />
      </AppI18nProvider>,
    );
    // The longest arm is 'They replied' (12), so at most ⌈12/3⌉ = 4 dots.
    const padding = /·+/.exec(view.container.textContent ?? '')?.[0] ?? '';
    expect(padding.length).toBeGreaterThan(0);
    expect(padding.length).toBeLessThanOrEqual(4);
  });

  it('leaves interpolated runtime values alone under the pseudo-locale', () => {
    // The pseudo-locale exists to show which text is translatable. Accenting
    // a participant's name proves nothing about the copy and makes the screen
    // unreadable for the person checking it.
    const view = render(
      <AppI18nProvider
        locale={pseudoAppLocale.locale}
        locales={[...registry, pseudoAppLocale]}
      >
        <Greeting name="Ada" />
      </AppI18nProvider>,
    );
    expect(view.container.textContent).toMatch(/Héllö/);
    expect(view.container.textContent).toContain('Ada');
  });

  it('accents source text inside rich-text tags', () => {
    function Guide() {
      const intl = useAppIntl();
      return (
        <p>
          {intl.formatMessage(messages.guide, {
            link: (chunks) => <a href="/guide">{chunks}</a>,
          })}
        </p>
      );
    }
    const view = render(
      <AppI18nProvider
        locale={pseudoAppLocale.locale}
        locales={[...registry, pseudoAppLocale]}
      >
        <Guide />
      </AppI18nProvider>,
    );
    // Text wrapped in a tag is still source copy, so it has to expand with the
    // rest — a link label is exactly the sort of thing that clips.
    expect(view.getByRole('link').textContent).toBe('thé gûîdé');
  });

  it('keeps plural selection working under the pseudo-locale', () => {
    const view = render(
      <AppI18nProvider
        locale={pseudoAppLocale.locale}
        locales={[...registry, pseudoAppLocale]}
      >
        <Count count={3} />
      </AppI18nProvider>,
    );
    expect(view.getByText(/résûlts/).textContent).toContain('3');
  });
});

describe('useAppLocale without a provider', () => {
  it('throws a descriptive error', () => {
    function Bare() {
      useAppLocale();
      return null;
    }
    expect(() => render(<Bare />)).toThrow(/AppI18nProvider/);
  });
});
