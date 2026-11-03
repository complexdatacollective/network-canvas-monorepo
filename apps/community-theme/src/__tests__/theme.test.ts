import { describe, expect, it } from 'vitest';

import { siteNavigationMessages } from '@codaco/fresco-ui/navigation/SiteNavigation.messages';
import {
  defaultSiteLocale,
  siteLocales,
  toScriptMatchingTag,
} from '@codaco/shared-consts';
import {
  buildScopes,
  contrastRatio,
  parseColor,
  type Scope,
  toDisplayColor,
} from '@codaco/tailwind-config/theme-colors';

import {
  SITE_LOCALES,
  siteLocaleFor,
} from '../../theme/javascripts/discourse/lib/site-locale.js';
import { themeStrings, toDiscourseMessage } from '../locales.ts';
import landingCatalog from '../locales/en.json';
import { PALETTE_NAMES } from '../palette.ts';
import { buildTheme } from '../theme.ts';

const files = buildTheme();

function text(path: string) {
  const file = files.find((candidate) => candidate.path === path);
  if (!file) throw new Error(`The built theme has no ${path}`);
  return file.contents.toString();
}

function about() {
  const parsed: unknown = JSON.parse(text('about.json'));
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('about.json is not an object');
  }
  return parsed as {
    color_schemes: Record<string, Record<string, string>>;
    assets: Record<string, string>;
  };
}

const stylesheets = files.filter(
  (file) => file.path.endsWith('.scss') && file.path !== 'scss/fonts.scss',
);

describe('design tokens', () => {
  it('declares every --nc-* token the stylesheets read, in both colour modes', () => {
    const definitions = text('common/color_definitions.scss');
    const [dark = '', light = ''] = definitions.split('} @else {');
    const declared = (css: string) =>
      new Set(
        [...css.matchAll(/(--nc-[a-z0-9-]+):/g)].map((match) => match[1]),
      );
    const darkTokens = declared(dark);
    const lightTokens = declared(light);
    // Tokens a partial derives from the generated ones (the radius steps).
    const derived = new Set(
      stylesheets.flatMap((file) => [...declared(file.contents.toString())]),
    );

    const read = new Set(
      stylesheets.flatMap((file) =>
        [...file.contents.toString().matchAll(/var\((--nc-[a-z0-9-]+)\)/g)].map(
          (match) => match[1],
        ),
      ),
    );
    expect(read.size).toBeGreaterThan(20);
    for (const token of read) {
      if (derived.has(token)) continue;
      expect(lightTokens, `${token} (light)`).toContain(token);
      expect(darkTokens, `${token} (dark)`).toContain(token);
    }
  });

  it('switches the tokens with the palette rather than with a selector', () => {
    const definitions = text('common/color_definitions.scss');
    expect(definitions).toContain('@if is-dark-color-scheme()');
    // The dark branch carries the dark background, the light branch the light.
    const [dark = '', light = ''] = definitions.split('} @else {');
    expect(dark).toMatch(/--nc-background: oklch\(0\.2 0\.03 290\);/);
    expect(light).toMatch(/--nc-background: color-mix\(in oklab,/);
  });
});

describe('palettes', () => {
  const schemes = about().color_schemes;

  it('ships a light and a dark palette with every slot as hex', () => {
    expect(Object.keys(schemes).toSorted()).toEqual(
      Object.values(PALETTE_NAMES).toSorted(),
    );
    for (const palette of Object.values(schemes)) {
      for (const value of Object.values(palette)) {
        expect(value).toMatch(/^[0-9A-F]{6}$/);
      }
    }
  });

  // Text and links over what they sit on, at WCAG AA for normal text: the
  // content sheet, menus and dialogs (secondary), the header bar, and the
  // page around the sheet (--background), where the sidebar's links sit.
  const PAIRS = [
    ['primary', 'secondary'],
    ['tertiary', 'secondary'],
    ['header_primary', 'header_background'],
    ['primary', '--background'],
    ['tertiary', '--background'],
  ] as const;

  // The dark palette's link colour is the design system's own dark --link,
  // which falls short of 4.5:1 on the dark surface and background; the
  // shared contrast test (tooling/tailwind) does not check link pairs. Each
  // is pinned to its measured ratio, so a change to either colour fails here
  // and gets looked at.
  const KNOWN_SHORTFALLS: Record<string, number> = {
    'Network Canvas Dark: tertiary on secondary': 4.13,
    'Network Canvas Dark: tertiary on --background': 4.31,
  };

  const scopes = buildScopes();
  const SCOPE_FOR: Record<string, Scope> = {
    [PALETTE_NAMES.light]: scopes['default-light'],
    [PALETTE_NAMES.dark]: scopes['default-dark'],
  };

  it('paints content in the colour of the sheet it sits on', () => {
    // Discourse paints topic rows, menus and dialogs with secondary; the
    // theme's content sheet is --surface.
    expect(text('scss/layout.scss')).toMatch(
      /#main-outlet \{[^}]*background: var\(--nc-surface\);/,
    );
    for (const [name, palette] of Object.entries(schemes)) {
      const scope = SCOPE_FOR[name];
      if (!scope) throw new Error(`No scope for the ${name} palette`);
      const surface = toDisplayColor(scope.token('--surface'))
        .toString({ format: 'hex', collapse: false })
        .slice(1)
        .toUpperCase();
      expect(palette.secondary, name).toBe(surface);
    }
  });

  it('keeps text and links legible on everything they sit on', () => {
    const shortfalls: Record<string, number> = {};
    for (const [name, palette] of Object.entries(schemes)) {
      const scope = SCOPE_FOR[name];
      if (!scope) throw new Error(`No scope for the ${name} palette`);
      const colour = (slot: string) =>
        slot.startsWith('--')
          ? toDisplayColor(scope.token(slot))
          : parseColor(`#${palette[slot] ?? ''}`);
      for (const [foreground, background] of PAIRS) {
        const ratio = contrastRatio(colour(foreground), colour(background));
        const pair = `${name}: ${foreground} on ${background}`;
        if (ratio < 4.5) shortfalls[pair] = Math.round(ratio * 100) / 100;
      }
    }
    expect(shortfalls).toEqual(KNOWN_SHORTFALLS);
  });

  it.each(['medium', 'high', 'very-high'])(
    'keeps --primary-%s, a muted text colour, legible on the content surface',
    (step) => {
      const declaration = new RegExp(`--primary-${step}: ([^;]+);`).exec(
        text('scss/variables.scss'),
      );
      if (!declaration?.[1])
        throw new Error(`No --primary-${step} in variables.scss`);
      // The theme reads the tokens as --nc-*; the scopes name them unprefixed.
      const expression = declaration[1].replaceAll('var(--nc-', 'var(--');
      for (const scope of Object.values(SCOPE_FOR)) {
        const ratio = contrastRatio(
          toDisplayColor(scope.color(expression)),
          toDisplayColor(scope.token('--surface')),
        );
        expect(ratio, scope.name).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  // The home page has no sheet (landing.scss): its lead and section text sit
  // on the page, and its tiles on --surface-2, in the darker muted step.
  it.each(['--background', '--surface-2'])(
    'keeps --primary-high legible on %s, where the home page sets text',
    (background) => {
      const declaration = /--primary-high: ([^;]+);/.exec(
        text('scss/variables.scss'),
      );
      if (!declaration?.[1]) throw new Error('No --primary-high');
      const expression = declaration[1].replaceAll('var(--nc-', 'var(--');
      for (const scope of Object.values(SCOPE_FOR)) {
        const ratio = contrastRatio(
          toDisplayColor(scope.color(expression)),
          toDisplayColor(scope.token(background)),
        );
        expect(ratio, scope.name).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  // A field's edge is what shows it is there: WCAG's non-text contrast asks
  // 3:1 against what surrounds it (the page) and what fills it (the surface).
  it('gives the home page search a visible edge', () => {
    const declaration =
      /\.search-input \{\s*border-color: (color-mix\([^;]+\));/.exec(
        text('scss/landing.scss'),
      );
    if (!declaration?.[1]) {
      throw new Error('No search field edge in landing.scss');
    }
    const expression = declaration[1]
      .replace(/\s+/g, ' ')
      .replaceAll('var(--nc-', 'var(--');
    for (const scope of Object.values(SCOPE_FOR)) {
      for (const background of ['--background', '--surface']) {
        const ratio = contrastRatio(
          toDisplayColor(scope.color(expression)),
          toDisplayColor(scope.token(background)),
        );
        expect(ratio, `${scope.name} on ${background}`).toBeGreaterThanOrEqual(
          3,
        );
      }
    }
  });

  // Notices are a tint of their colour under the text colour (alerts.scss),
  // because the shared Alert's white-on-colour fills fall short of 4.5:1.
  it.each(['text', 'info', 'success', 'warning', 'destructive'])(
    'keeps text legible on a %s notice',
    (colour) => {
      const declaration =
        /background-color: (color-mix\(\s*in oklab,\s*var\(--nc-alert-color\)[^;]+\));/.exec(
          text('scss/alerts.scss'),
        );
      if (!declaration?.[1]) {
        throw new Error('No notice background in alerts.scss');
      }
      const expression = declaration[1]
        .replace(/\s+/g, ' ')
        .replace('var(--nc-alert-color)', `var(--nc-${colour})`)
        .replaceAll('var(--nc-', 'var(--');
      for (const scope of Object.values(SCOPE_FOR)) {
        const ratio = contrastRatio(
          toDisplayColor(scope.token('--text')),
          toDisplayColor(scope.color(expression)),
        );
        expect(ratio, scope.name).toBeGreaterThanOrEqual(4.5);
      }
    },
  );
});

describe('fonts', () => {
  it('uploads every face the @font-face rules point at, and nothing else', () => {
    const { assets } = about();
    const referenced = new Set(
      [...text('scss/fonts.scss').matchAll(/url\(\$([a-z0-9-]+)\)/g)].map(
        (match) => match[1],
      ),
    );
    expect(referenced.size).toBe(16);
    expect(new Set(Object.keys(assets))).toEqual(referenced);
    for (const path of Object.values(assets)) {
      expect(files.map((file) => file.path)).toContain(path);
    }
  });
});

describe('languages', () => {
  it('maps a Discourse locale for every site locale', () => {
    expect(new Set(Object.values(SITE_LOCALES))).toEqual(new Set(siteLocales));
  });

  it.each(Object.entries(SITE_LOCALES))(
    'maps %s to the site locale its language tag matches',
    (discourseLocale, siteLocale) => {
      const expected =
        discourseLocale === 'en'
          ? defaultSiteLocale
          : toScriptMatchingTag(discourseLocale.replace('_', '-'));
      expect(siteLocale).toBe(expected);
    },
  );

  it('shows the header in US English for any other forum language', () => {
    expect(siteLocaleFor('ja')).toBe(defaultSiteLocale);
    expect(siteLocaleFor('constructor')).toBe(defaultSiteLocale);
  });

  it.each(Object.entries(SITE_LOCALES))(
    'titles the forum in %s with the shared header’s own word',
    (discourseLocale, siteLocale) => {
      const yaml = text(`locales/${discourseLocale}.yml`);
      const label =
        siteNavigationMessages[
          siteLocale as keyof typeof siteNavigationMessages
        ].community;
      expect(yaml).toContain(
        `${discourseLocale}:\n  community: ${JSON.stringify(label)}`,
      );
    },
  );

  const english = themeStrings().find(
    ({ discourseLocale }) => discourseLocale === 'en',
  )?.strings;
  const lookUp = (key: string) =>
    key
      .split('.')
      .reduce<unknown>(
        (branch, segment) =>
          typeof branch === 'object' && branch !== null
            ? Object.fromEntries(Object.entries(branch))[segment]
            : undefined,
        english,
      );
  // `themePrefix("key")` in JavaScript, `(themePrefix "key")` in a template,
  // and the landing page's keys, which its routes table spells out in full.
  const askedFor = new Set(
    files
      .filter((file) => file.path.startsWith('javascripts/'))
      .flatMap((file) => [
        ...file.contents
          .toString()
          .matchAll(/themePrefix[(\s]+"([^"]+)"|"(landing\.[\w.]+)"/g),
      ])
      .map((match) => match[1] ?? match[2]),
  );

  it('translates every theme string the JavaScript asks for', () => {
    expect(askedFor.size).toBeGreaterThan(30);
    for (const key of askedFor) {
      expect(lookUp(key ?? ''), key).toBeDefined();
    }
  });

  it('uses every landing page message it ships', () => {
    const shipped = Object.keys(landingCatalog).map((id) =>
      id.replace(/^communityTheme\./, ''),
    );
    expect(shipped.filter((key) => !askedFor.has(key))).toEqual([]);
  });

  it('turns ICU plurals and arguments into Discourse translations', () => {
    expect(
      toDiscourseMessage(
        '{count, plural, one {# reply} few {# odpowiedzi} other {# replies}}',
        'replies',
      ),
    ).toEqual({
      one: '%{count} reply',
      few: '%{count} odpowiedzi',
      other: '%{count} replies',
    });
    // A category the language has and the message leaves to `other` is
    // spelled out, since Discourse does not fall back to `other` as ICU does.
    expect(
      toDiscourseMessage(
        '{count, plural, one {# réponse} other {# réponses}}',
        'replies',
        'fr',
      ),
    ).toEqual({
      one: '%{count} réponse',
      many: '%{count} réponses',
      other: '%{count} réponses',
    });
    expect(
      toDiscourseMessage('{count, plural, other {# 条回复}}', 'replies', 'zh'),
    ).toEqual({ other: '%{count} 条回复' });
    expect(toDiscourseMessage('Hello {name}', 'greeting')).toBe(
      'Hello %{name}',
    );
    expect(() =>
      toDiscourseMessage('{n, plural, one {#} other {#}}', 'notCount'),
    ).toThrow(/count/);
    // Discourse chooses a form by CLDR category only, so an exact match would
    // be shipped and never shown.
    expect(() =>
      toDiscourseMessage(
        '{count, plural, =0 {None} one {#} other {#}}',
        'exact',
      ),
    ).toThrow(/=0/);
    expect(() =>
      toDiscourseMessage('{kind, select, a {A} other {B}}', 'select'),
    ).toThrow(/plain text/);
  });
});
