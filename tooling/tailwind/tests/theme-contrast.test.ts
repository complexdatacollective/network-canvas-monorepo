import Color from 'colorjs.io';
/**
 * Colour contrast of the Fresco theme tokens against WCAG 2.2 AA (#1318).
 *
 * Three things are checked, all from the CSS in `fresco/themes/*.css`:
 *
 *  1. Every fill / `-contrast` pair, in every theme and mode, reaches AA
 *     (4.5:1, the normal-size text criterion, SC 1.4.3). Pairs that fall short
 *     today are listed in KNOWN_FAILURES with a reason; the list is compared
 *     for exact equality, so a new failure fails the test and so does a known
 *     failure that starts passing.
 *  2. Every ratio quoted in a comment in those files (`recorded-ratios.ts`)
 *     still agrees with the colours it was measured on, to within
 *     RATIO_TOLERANCE, and every ratio the files quote is accounted for.
 *  3. The parser cannot pass vacuously: the pairs found must be exactly the
 *     expected set, in every scope.
 *
 * How colours are evaluated: `theme-colors.ts` resolves the cascade for one
 * themed element (var() substitution at the declaring element, calc(), relative
 * oklch(), color-mix()) and colorjs.io does the colour maths. Colours outside
 * the sRGB gamut are clipped channel by channel, which is what Chromium paints
 * on an sRGB display; it does not run the CSS Color 4 chroma-reduction mapper.
 * That was checked against Chromium itself: every colour token in all seven
 * scopes below, painted as a background and read back from a screenshot, lands
 * within 1/255 per channel of the value used here. Contrast is the WCAG 2.x
 * ratio, whose formula WCAG 2.2 did not change.
 *
 * All pairs use the 4.5:1 normal-text target. None is allowed the 3:1
 * large-text / non-text target: these pairs carry button labels, alerts,
 * badges and field errors at ordinary sizes.
 */
import { describe, expect, test } from 'vitest';

import { RECORDED_RATIOS, type Backdrop } from './recorded-ratios.ts';
import {
  buildScopes,
  compositeOver,
  contrastRatio,
  readThemeSource,
  Scope,
  THEME_FILES,
  toDisplayColor,
  type ScopeName,
} from './theme-colors.ts';

const AA_NORMAL_TEXT = 4.5;

/**
 * How far a ratio quoted in a comment may sit from the computed one. The
 * comments quote two decimals and were measured by hand, and the gap between
 * the methods on out-of-gamut colours is a few hundredths; a token edit that
 * matters moves a ratio by more than this.
 */
const RATIO_TOLERANCE = 0.05;

const scopes = buildScopes();

/** Scopes whose pairs are asserted. The two `-host` scopes are checked for equality instead. */
const ASSERTED_SCOPES = [
  'default-light',
  'default-dark',
  'interview',
  'studio-light',
  'studio-dark',
] as const satisfies readonly ScopeName[];

// ---------------------------------------------------------------------------
// Pair discovery
// ---------------------------------------------------------------------------

/**
 * `--X-contrast` is the ink for the fill `--X`, with one exception: the boxed
 * field error draws `--destructive-box-contrast` on `--destructive`.
 */
const FILL_FOR_CONTRAST: Record<string, string> = {
  '--destructive-box-contrast': '--destructive',
};

type Pair = { fill: string; contrast: string };

function pairKey(scope: ScopeName, pair: Pair) {
  return `${scope} ${pair.fill} / ${pair.contrast}`;
}

function discoverPairs(scope: Scope): Pair[] {
  return scope
    .propertyNames()
    .filter(
      (name) => name.endsWith('-contrast') && !name.startsWith('--color-'),
    )
    .toSorted()
    .map((contrast) => ({
      fill: FILL_FOR_CONTRAST[contrast] ?? contrast.replace(/-contrast$/, ''),
      contrast,
    }));
}

/**
 * Every pair every scope must define. Written out so that a pair the parser
 * stops seeing (a renamed token, a changed selector) fails here instead of
 * quietly shrinking the checked set. Adding a pair to a theme means adding it
 * here too.
 */
const EXPECTED_PAIRS: Pair[] = [
  ...[
    'accent',
    'destructive',
    'info',
    'input',
    'neutral',
    'node-1',
    'node-2',
    'node-3',
    'node-4',
    'node-5',
    'node-6',
    'node-7',
    'node-8',
    'primary',
    'secondary',
    'selected',
    'success',
    'surface',
    'surface-1',
    'surface-2',
    'surface-3',
    'surface-4',
    'surface-accent',
    'surface-accent-1',
    'surface-accent-2',
    'surface-accent-3',
    'surface-accent-4',
    'surface-popover',
    'warning',
  ].map((name) => ({ fill: `--${name}`, contrast: `--${name}-contrast` })),
  { fill: '--destructive', contrast: '--destructive-box-contrast' },
].toSorted((a, b) => a.contrast.localeCompare(b.contrast));

/**
 * The page itself: body text on the ground. `--text` has no `-contrast` name
 * because the ground is not a fill, but it is the pair every other surface is
 * read against.
 */
const GROUND_PAIR: Pair = { fill: '--background', contrast: '--text' };

function ratioOf(scope: Scope, pair: Pair) {
  return contrastRatio(scope.token(pair.contrast), scope.token(pair.fill));
}

// ---------------------------------------------------------------------------
// Known failures
// ---------------------------------------------------------------------------

type KnownFailure = {
  scope: ScopeName;
  fill: string;
  contrast: string;
  reason: string;
};

/**
 * Pairs under 4.5:1 today. These are design decisions, not test fixes: do not
 * change a colour to empty this list without the design owner. The list is
 * compared for exact equality with the failing set in both directions.
 */
const KNOWN_FAILURES: KnownFailure[] = [
  {
    scope: 'default-light',
    fill: '--success',
    contrast: '--success-contrast',
    reason:
      'White on neat sea green. studio.css records this as a defect of the default theme that studio corrected, to be fixed in the default theme in its own change.',
  },
  {
    scope: 'default-dark',
    fill: '--destructive',
    contrast: '--destructive-contrast',
    reason:
      'White on the lifted tomato is 3.85:1. default.css notes it; field errors avoid it through --destructive-box-contrast, but Alert, Toast and Badge still draw --destructive-contrast.',
  },
  {
    scope: 'default-dark',
    fill: '--info',
    contrast: '--info-contrast',
    reason:
      "White on the lifted cerulean. studio.css notes the default theme carries the same defect studio's dark block corrected with dark ink.",
  },
  {
    scope: 'default-dark',
    fill: '--success',
    contrast: '--success-contrast',
    reason:
      'White on the lifted sea green; studio.css notes the default theme carries the same defect studio corrected.',
  },
  {
    scope: 'interview',
    fill: '--info',
    contrast: '--info-contrast',
    reason: 'White on neat cerulean blue sits just under AA (4.42:1).',
  },
  {
    scope: 'interview',
    fill: '--primary',
    contrast: '--primary-contrast',
    reason:
      'White on neat sea green: the interview theme uses the unadjusted palette colour for its primary fill.',
  },
  {
    scope: 'interview',
    fill: '--success',
    contrast: '--success-contrast',
    reason: 'White on neat sea green, the same colour as --primary here.',
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('contrast measurement', () => {
  test('matches known WCAG values', () => {
    const black = new Color('black');
    const white = new Color('white');
    expect(contrastRatio(black, white)).toBeCloseTo(21, 5);
    expect(contrastRatio(white, white)).toBeCloseTo(1, 5);
    // #767676 on white is the lightest grey that passes AA: 4.54:1.
    expect(contrastRatio(new Color('#767676'), white)).toBeCloseTo(4.54, 2);
    // #777777 on white just misses it: 4.48:1.
    expect(contrastRatio(new Color('#777777'), white)).toBeCloseTo(4.48, 2);
  });

  test('clips colours outside the sRGB gamut rather than scaling them', () => {
    // oklch(0.7 0.4 150) is far outside sRGB; clipped it is saturated green.
    const wild = new Color('oklch', [0.7, 0.4, 150]);
    const clipped = contrastRatio(wild, new Color('black'));
    const mapped = contrastRatio(
      new Color(wild).toGamut({ space: 'srgb', method: 'css' }),
      new Color('black'),
    );
    expect(clipped).not.toBeCloseTo(mapped, 1);
  });

  test('measures a translucent ink over the fill it is drawn on, so a transparent ink fails', () => {
    const scope = new Scope('probe', [
      new Map([
        ['--probe', 'oklch(0.3 0.1 200)'],
        ['--probe-contrast', 'oklch(1 0 0 / 0)'],
        ['--probe-half-contrast', 'oklch(1 0 0 / 0.5)'],
        ['--probe-solid-contrast', 'oklch(1 0 0)'],
      ]),
    ]);
    const ratio = (ink: string) =>
      contrastRatio(scope.token(ink), scope.token('--probe'));
    // Fully transparent ink is the fill itself: 1:1, far under AA.
    expect(ratio('--probe-contrast')).toBeCloseTo(1, 5);
    expect(ratio('--probe-contrast')).toBeLessThan(AA_NORMAL_TEXT);
    // Half-opaque ink lands between the fill and solid ink.
    expect(ratio('--probe-half-contrast')).toBeGreaterThan(1);
    expect(ratio('--probe-half-contrast')).toBeLessThan(
      ratio('--probe-solid-contrast'),
    );
  });

  test('refuses to guess a translucent fill or colour with no backdrop', () => {
    const white = new Color('white');
    const clear = new Color('oklch', [0.3, 0.1, 200], 0.5);
    expect(() => contrastRatio(white, clear)).toThrow(/translucent/);
    expect(() => toDisplayColor(clear)).toThrow(/translucent/);
    // Given its backdrop, the same fill is measurable.
    expect(contrastRatio(white, clear, white)).toBeCloseTo(
      contrastRatio(white, compositeOver(clear, 1, white)),
      8,
    );
  });

  test('composites a tint over its backdrop in sRGB', () => {
    const half = compositeOver(new Color('#000000'), 0.5, new Color('#ffffff'));
    expect(half.to('srgb').coords[0]).toBeCloseTo(0.5, 6);
  });
});

describe('theme pairs are all found', () => {
  test.each([
    ...ASSERTED_SCOPES,
    'interview-in-dark-host',
    'studio-dark-from-host',
  ] as const)(
    '%s defines exactly the expected fill / -contrast pairs',
    (name) => {
      expect(discoverPairs(scopes[name])).toEqual(EXPECTED_PAIRS);
    },
  );

  test('every fill has its -contrast partner and every -contrast has a fill', () => {
    for (const name of ASSERTED_SCOPES) {
      const scope = scopes[name];
      for (const pair of EXPECTED_PAIRS) {
        expect(scope.has(pair.fill), `${name}: ${pair.fill} is missing`).toBe(
          true,
        );
        expect(
          scope.has(pair.contrast),
          `${name}: ${pair.contrast} is missing`,
        ).toBe(true);
      }
      expect(scope.has(GROUND_PAIR.fill)).toBe(true);
      expect(scope.has(GROUND_PAIR.contrast)).toBe(true);
    }
  });

  test('the parser sees every -contrast token declared in the theme files', () => {
    const declared = new Set<string>();
    for (const file of Object.values(THEME_FILES)) {
      const source = readThemeSource(file).replace(/\/\*[\s\S]*?\*\//g, '');
      for (const match of source.matchAll(/(--[a-z0-9-]+-contrast)\s*:/g)) {
        if (match[1]) declared.add(match[1]);
      }
    }
    expect(declared.size).toBeGreaterThan(20);
    const expected = new Set(EXPECTED_PAIRS.map((pair) => pair.contrast));
    expect([...declared].filter((name) => !expected.has(name))).toEqual([]);
  });

  test('the host-dark variants resolve every pair to the same colours as the scope they mirror', () => {
    // `studio-dark-from-host` is `data-theme='dark'` on an ancestor rather than
    // on the studio region; the interview region ignores the attribute. If any
    // pair differed, the second selector would need its own assertions.
    const mirrors = [
      ['studio-dark-from-host', 'studio-dark'],
      ['interview-in-dark-host', 'interview'],
    ] as const;
    for (const [variant, original] of mirrors) {
      for (const pair of [...EXPECTED_PAIRS, GROUND_PAIR]) {
        for (const token of [pair.fill, pair.contrast]) {
          expect(
            scopes[variant].token(token).to('srgb').toString(),
            `${token} in ${variant} differs from ${original}`,
          ).toBe(scopes[original].token(token).to('srgb').toString());
        }
      }
    }
  });
});

describe('WCAG 2.2 AA (4.5:1) for every fill / -contrast pair', () => {
  const rows = ASSERTED_SCOPES.flatMap((name) =>
    [...EXPECTED_PAIRS, GROUND_PAIR].map((pair) => ({
      scope: name,
      pair,
      ratio: ratioOf(scopes[name], pair),
    })),
  );

  test('covers every pair in every asserted scope', () => {
    expect(rows).toHaveLength(
      ASSERTED_SCOPES.length * (EXPECTED_PAIRS.length + 1),
    );
    expect(rows.length).toBeGreaterThan(100);
  });

  test('exactly the known failures fall below AA', () => {
    const failing = rows
      .filter((row) => row.ratio < AA_NORMAL_TEXT)
      .map((row) => pairKey(row.scope, row.pair))
      .toSorted();
    const known = KNOWN_FAILURES.map((entry) =>
      pairKey(entry.scope, entry),
    ).toSorted();
    expect(failing).toEqual(known);
  });

  test('every known failure has a reason', () => {
    for (const entry of KNOWN_FAILURES) {
      expect(entry.reason.length, pairKey(entry.scope, entry)).toBeGreaterThan(
        20,
      );
    }
  });

  test.each(rows.filter((row) => !isKnownFailure(row.scope, row.pair)))(
    '$scope $pair.fill / $pair.contrast reaches AA',
    ({ ratio }) => {
      expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    },
  );
});

function isKnownFailure(scope: ScopeName, pair: Pair) {
  return KNOWN_FAILURES.some(
    (entry) =>
      entry.scope === scope &&
      entry.fill === pair.fill &&
      entry.contrast === pair.contrast,
  );
}

describe('claims the theme files make beyond the pairs', () => {
  test('each interview node fill reaches 3:1 against the interview background', () => {
    // default.css: "each node reaches 3:1 against the interview background".
    // 3:1 is the non-text contrast criterion (SC 1.4.11) for a graphical object.
    const scope = scopes.interview;
    const background = scope.token('--background');
    for (let node = 1; node <= 8; node++) {
      const ratio = contrastRatio(scope.token(`--node-${node}`), background);
      expect(
        ratio,
        `--node-${node} on the interview background`,
      ).toBeGreaterThanOrEqual(3);
    }
  });
});

// ---------------------------------------------------------------------------
// Ratios recorded in comments
// ---------------------------------------------------------------------------

/** Comment text with the leading ` * ` of each line removed and whitespace collapsed. */
function proseOf(file: string) {
  return readThemeSource(file)
    .replace(/\s*\n\s*\*?\s*/g, ' ')
    .replace(/\s+/g, ' ');
}

/** Ratios that are targets (the AA thresholds), not measurements. */
const THRESHOLDS = new Set([3, 4.5]);

/** Every `N:1` in `text`, as numbers, thresholds included. */
function ratiosIn(text: string) {
  return [...text.matchAll(/(?<![\d.])(\d+(?:\.\d+)?):1(?!\d)/g)].map((match) =>
    Number.parseFloat(match[1] ?? ''),
  );
}

function mentionedRatios(file: string) {
  return ratiosIn(proseOf(file))
    .filter((value) => !THRESHOLDS.has(value))
    .toSorted((a, b) => a - b);
}

function backdropColor(scope: Scope, backdrop: Backdrop) {
  if (typeof backdrop === 'string') return scope.color(backdrop);
  return compositeOver(
    scope.color(backdrop.tint),
    backdrop.alpha,
    scope.color(backdrop.over),
  );
}

describe('ratios recorded in theme comments', () => {
  test('there are recorded ratios to check', () => {
    expect(RECORDED_RATIOS.length).toBeGreaterThan(40);
  });

  test.each(Object.keys(THEME_FILES) as (keyof typeof THEME_FILES)[])(
    '%s.css: every ratio its comments quote is accounted for, and none is left over',
    (file) => {
      const claimed = RECORDED_RATIOS.filter((entry) => entry.file === file)
        .map((entry) => entry.ratio)
        .toSorted((a, b) => a - b);
      expect(mentionedRatios(THEME_FILES[file])).toEqual(claimed);
    },
  );

  test.each(
    RECORDED_RATIOS.map(
      (entry) => [`${entry.file}.css: ${entry.quote}`, entry] as const,
    ),
  )('%s', (_title, entry) => {
    const prose = proseOf(THEME_FILES[entry.file]);
    const occurrences = prose.split(entry.quote).length - 1;
    expect(
      occurrences,
      `"${entry.quote}" must appear exactly once in ${entry.file}.css`,
    ).toBe(1);
    expect(
      ratiosIn(entry.quote),
      'the quote must contain the ratio it records',
    ).toContain(entry.ratio);

    expect(entry.measurements.length).toBeGreaterThan(0);
    for (const measurement of entry.measurements) {
      const scope = scopes[measurement.scope];
      const computed = contrastRatio(
        scope.color(measurement.fg),
        backdropColor(scope, measurement.bg),
      );
      expect(
        Math.abs(computed - entry.ratio),
        `${measurement.scope}: ${measurement.fg} on ${JSON.stringify(measurement.bg)} computes ${computed.toFixed(3)}:1, the comment says ${entry.ratio}:1`,
      ).toBeLessThanOrEqual(RATIO_TOLERANCE);
    }
  });
});
