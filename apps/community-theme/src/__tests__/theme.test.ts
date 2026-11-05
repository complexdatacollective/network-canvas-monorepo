import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  defaultSiteLocale,
  siteLocales,
  toScriptMatchingTag,
} from '@codaco/shared-consts';
import {
  compositeOver,
  contrastRatio,
  parseColor,
  type Scope,
  toDisplayColor,
} from '@codaco/tailwind-config/theme-colors';

import { NETWORK_CANVAS } from '../../theme/javascripts/discourse/lib/site-links.js';
import {
  SITE_LOCALES,
  siteLocaleFor,
} from '../../theme/javascripts/discourse/lib/site-locale.js';
import { themeStrings, toDiscourseMessage } from '../locales.ts';
import landingCatalog from '../locales/en.json';
import { PALETTE_NAMES } from '../palette.ts';
import { forumScopes } from '../scopes.ts';
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
    // Tokens a hand-written partial derives from the generated ones (the
    // radius steps and the forum bar's colour). The generated file itself is
    // left out, or every generated token would count as derived and none
    // would be checked per mode.
    const derived = new Set(
      stylesheets
        .filter((file) => file.path !== 'common/color_definitions.scss')
        .flatMap((file) => [...declared(file.contents.toString())]),
    );

    const read = new Set(
      stylesheets.flatMap((file) =>
        [...file.contents.toString().matchAll(/var\((--nc-[a-z0-9-]+)\)/g)].map(
          (match) => match[1],
        ),
      ),
    );
    const generated = [...read].filter((token) => !derived.has(token));
    expect(generated.length).toBeGreaterThan(20);
    for (const token of generated) {
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
  // content sheet, menus and dialogs (secondary), the header bar, the page
  // around the sheet (--background), where the sidebar's links sit, and the
  // tint of hovered rows and the home page's tiles (--surface-2). The shared
  // contrast test (tooling/tailwind) does not check link pairs, and the
  // design system's dark link falls short on three of these, so the forum
  // lightens it (scopes.ts).
  const PAIRS = [
    ['primary', 'secondary'],
    ['tertiary', 'secondary'],
    ['header_primary', 'header_background'],
    ['primary', '--background'],
    ['tertiary', '--background'],
    ['primary', '--surface-2'],
    ['tertiary', '--surface-2'],
  ] as const;

  const scopes = forumScopes();
  const SCOPE_FOR: Record<string, Scope> = {
    [PALETTE_NAMES.light]: scopes.light,
    [PALETTE_NAMES.dark]: scopes.dark,
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

  // Every label the theme sets on a fill (buttons, notices) reads a token's
  // `-contrast` partner, so each partner the stylesheets read is checked
  // against its fill, in both palettes.
  it('keeps every label legible on its fill', () => {
    const fills = new Set(
      stylesheets.flatMap((file) =>
        [
          ...file.contents
            .toString()
            .matchAll(/var\(--nc-([a-z-]+)-contrast\)/g),
        ].map((match) => `--${match[1]}`),
      ),
    );
    expect(fills).toContain('--success');
    expect(fills).toContain('--destructive');
    const shortfalls: Record<string, number> = {};
    for (const scope of Object.values(SCOPE_FOR)) {
      for (const fill of fills) {
        const ratio = contrastRatio(
          toDisplayColor(scope.token(fill)),
          toDisplayColor(scope.token(`${fill}-contrast`)),
        );
        if (ratio < 4.5) {
          shortfalls[`${scope.name}: ${fill}-contrast on ${fill}`] =
            Math.round(ratio * 100) / 100;
        }
      }
    }
    expect(shortfalls).toEqual({});
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
    expect(shortfalls).toEqual({});
  });

  // The shades Discourse derives from the palette's text colour by lightening
  // it in HSL (color_transformations.scss), which the theme replaces with
  // OKLab mixes of its tokens (variables.scss). Left to Discourse, a shade
  // turns violet and, in a dark palette, a light-or-dark pair turns too faint
  // to read.
  const DISCOURSE_SHADES = [
    'very-low',
    'low',
    'low-mid',
    'medium',
    'high',
    'very-high',
    '50',
    '100',
    '200',
    '300',
    '400',
    '500',
    '600',
    '700',
    '800',
    '900',
    'med-or-secondary-med',
    'med-or-secondary-high',
    'high-or-secondary-low',
    'low-mid-or-secondary-high',
    'low-mid-or-secondary-low',
  ].map((shade) => `--primary-${shade}`);

  // Those Discourse sets text in (`color:` in its stylesheets); the rest are
  // borders, fills and decoration. The wiki date is a fixed colour of
  // Discourse's that the theme also sets.
  const TEXT_SHADES = [
    'medium',
    'high',
    'very-high',
    '500',
    '600',
    '700',
    '800',
    '900',
    'med-or-secondary-med',
    'med-or-secondary-high',
    'high-or-secondary-low',
    'low-mid-or-secondary-high',
  ]
    .map((shade) => `--primary-${shade}`)
    .concat('--wiki');

  const shadeDeclarations = new Map(
    [
      ...text('scss/variables.scss').matchAll(
        /(--(?:primary-[\w-]+|wiki)): ([^;]+);/g,
      ),
    ].map(([, name = '', value = '']) => [name, value]),
  );

  // A shade's CSS with the shades it reads substituted, in the scopes'
  // unprefixed token names (the theme reads the tokens as --nc-*).
  function shadeExpression(name: string): string {
    const declaration = shadeDeclarations.get(name);
    if (!declaration) throw new Error(`No ${name} in variables.scss`);
    return declaration
      .replaceAll(/var\((--primary-[\w-]+)\)/g, (_, shade: string) =>
        shadeExpression(shade),
      )
      .replaceAll('var(--nc-', 'var(--');
  }

  it("replaces every shade Discourse derives from the palette's text colour", () => {
    expect(
      DISCOURSE_SHADES.filter((shade) => !shadeDeclarations.has(shade)),
    ).toEqual([]);
  });

  it.each(TEXT_SHADES)(
    'keeps %s, a muted text colour, legible on the content surface',
    (shade) => {
      for (const scope of Object.values(SCOPE_FOR)) {
        const ratio = contrastRatio(
          toDisplayColor(scope.color(shadeExpression(shade))),
          toDisplayColor(scope.token('--surface')),
        );
        expect(ratio, scope.name).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  // The home page has no sheet (landing.scss): its lead and section text sit
  // on the page, in the darker muted step, and the page is tinted by three
  // glows (layout.scss) at a strength set per palette. Measured where all
  // three are at their strongest at once, which no spot on the page is, so
  // the page is as far from the text as it can be.
  it('keeps --primary-high legible on the home page, glows and all', () => {
    const declaration = /--primary-high: ([^;]+);/.exec(
      text('scss/variables.scss'),
    );
    if (!declaration?.[1]) throw new Error('No --primary-high');
    const expression = declaration[1].replaceAll('var(--nc-', 'var(--');

    const glows = [
      ...text('scss/layout.scss').matchAll(
        /oklch\(var\(--nc-([a-z-]+)\)\) calc\(([\d.]+)% \* var\(--nc-glow-strength\)\)/g,
      ),
    ];
    expect(glows).toHaveLength(3);

    const [dark = '', light = ''] = text('common/color_definitions.scss').split(
      '} @else {',
    );
    const strength = (css: string) => {
      const value = /--nc-glow-strength: ([\d.]+);/.exec(css)?.[1];
      if (value === undefined) throw new Error('No --nc-glow-strength');
      return Number(value);
    };

    for (const [scope, definitions] of [
      [scopes.light, light],
      [scopes.dark, dark],
    ] as const) {
      const page = glows.reduce(
        (backdrop, [, colour, percent]) =>
          compositeOver(
            scope.color(`oklch(var(--${colour}))`),
            (Number(percent) / 100) * strength(definitions),
            backdrop,
          ),
        toDisplayColor(scope.token('--background')),
      );
      const ratio = contrastRatio(
        toDisplayColor(scope.color(expression)),
        page,
      );
      expect(ratio, scope.name).toBeGreaterThanOrEqual(4.5);
    }
  });

  // The home page's tiles are --surface-2, with their text in the darker
  // muted step and their default button drawn from the tile's colour
  // (landing.scss); the button keeps the shared default button's label.
  it('keeps the home page tiles legible on --surface-2', () => {
    const shade = /--primary-high: ([^;]+);/.exec(text('scss/variables.scss'));
    const fill = /--d-button-default-bg-color: (color-mix\([^;]+\));/.exec(
      text('scss/landing.scss'),
    );
    if (!shade?.[1] || !fill?.[1]) {
      throw new Error('No --primary-high or tile button colour');
    }
    const local = (css: string) =>
      css
        .replaceAll('var(--nc-', 'var(--')
        .replace(/\s+/g, ' ')
        .replaceAll('( ', '(')
        .replaceAll(' )', ')');
    for (const scope of Object.values(SCOPE_FOR)) {
      const tile = toDisplayColor(scope.token('--surface-2'));
      expect(
        contrastRatio(toDisplayColor(scope.color(local(shade[1]))), tile),
        `${scope.name} text`,
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(
          toDisplayColor(scope.token('--neutral-contrast')),
          toDisplayColor(scope.color(local(fill[1]))),
        ),
        `${scope.name} button label`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

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
    const fonts = Object.entries(assets).filter(([name]) =>
      name.startsWith('nc-font-'),
    );
    expect(new Set(fonts.map(([name]) => name))).toEqual(referenced);
    for (const [, path] of fonts) {
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

// The header is the shared header's own element, so the theme repeats only
// where the forum's logo goes beside a docked topic title, which is held here
// to the header's source.
describe('the shared header', () => {
  it('loads a release of the element with the layouts the forum uses, and every later one in its major', () => {
    const url = /site_navigation_script_url:[^]*?default: '([^']+)'/.exec(
      text('settings.yml'),
    )?.[1];
    const range = /site-navigation-element@\^(\d+)\.(\d+)\.(\d+)\//.exec(
      url ?? '',
    );
    if (!range) throw new Error(`Expected a caret range in ${url}`);
    const manifest: unknown = JSON.parse(
      readFileSync(
        new URL(
          '../../../../packages/site-navigation-element/package.json',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    if (
      typeof manifest !== 'object' ||
      manifest === null ||
      !('version' in manifest) ||
      typeof manifest.version !== 'string'
    ) {
      throw new Error('The element has no version');
    }
    const lowest = range.slice(1, 4).map(Number);
    const current = manifest.version.split('.').map(Number);
    const order = (a: number[], b: number[]) =>
      a.reduce((found, part, index) => found || part - (b[index] ?? 0), 0);

    // 1.3.0 is the first release with the embedded and menu layouts.
    expect(order(lowest, [1, 3, 0])).toBeGreaterThanOrEqual(0);
    // The range admits the element's own version, so the forum follows its
    // releases instead of staying on an older major.
    expect(current[0]).toBe(lowest[0]);
    expect(order(current, lowest)).toBeGreaterThanOrEqual(0);
  });
});

describe("the forum's logo", () => {
  it('goes to the website, as the shared header’s does', () => {
    const header = readFileSync(
      new URL(
        '../../../../packages/fresco-ui/src/navigation/SiteNavigation.tsx',
        import.meta.url,
      ),
      'utf8',
    );
    const website = /networkCanvas:\s*'([^']+)'/.exec(header)?.[1];
    expect(website).toMatch(/^https:/);
    expect(NETWORK_CANVAS).toBe(website);
  });
});
