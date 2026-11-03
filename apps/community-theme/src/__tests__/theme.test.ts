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

  // Text and links over what they sit on: the page, the header bar and the
  // white content sheet (--surface), at WCAG AA for normal text.
  const PAIRS = [
    ['primary', 'secondary'],
    ['tertiary', 'secondary'],
    ['header_primary', 'header_background'],
    ['primary', '--surface'],
    ['tertiary', '--surface'],
  ] as const;

  // The dark palette's link colour is the design system's own dark --link,
  // which falls short of 4.5:1 on the dark background and surface; the
  // shared contrast test (tooling/tailwind) does not check link pairs. Each
  // is pinned to its measured ratio, so a change to either colour fails here
  // and gets looked at.
  const KNOWN_SHORTFALLS: Record<string, number> = {
    'Network Canvas Dark: tertiary on secondary': 4.3,
    'Network Canvas Dark: tertiary on --surface': 4.13,
  };

  const scopes = buildScopes();
  const SCOPE_FOR: Record<string, Scope> = {
    [PALETTE_NAMES.light]: scopes['default-light'],
    [PALETTE_NAMES.dark]: scopes['default-dark'],
  };

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

  it('translates every theme string the JavaScript asks for', () => {
    const english = text('locales/en.yml');
    const keys = files
      .filter((file) => file.path.startsWith('javascripts/'))
      .flatMap((file) =>
        // `themePrefix("key")` in JavaScript, `(themePrefix "key")` in a template.
        [
          ...file.contents.toString().matchAll(/themePrefix[(\s]+"([^"]+)"/g),
        ].map((match) => match[1]),
      );
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) expect(english).toContain(`\n  ${key}: `);
  });
});
