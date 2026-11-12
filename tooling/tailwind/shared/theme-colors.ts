/**
 * A small CSS custom-property resolver for the Fresco theme files, enough to
 * turn a token such as `--surface-accent-contrast` into an sRGB colour exactly
 * the way a browser's cascade would for one themed region.
 *
 * It models only what the theme files use: `var()` substitution at the element
 * a declaration sits on, `calc()`, `oklch()` (absolute and relative), `white` /
 * `black`, and `color-mix()` in `oklab` and `oklch`. Anything else throws
 * rather than guessing, so a new syntax in a theme file fails the contrast
 * test loudly instead of being skipped.
 *
 * The colour maths (OKLCH conversion, mixing, WCAG contrast) is colorjs.io's.
 *
 * Exported to this repository as `@codaco/tailwind-config/theme-colors`, for
 * build tools that need a token as a concrete colour: the contrast test
 * (`tests/`) and the community forum's Discourse theme, whose colour palettes
 * must be hex values. It is not published (see `publishConfig.exports`).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import Color from 'colorjs.io';

const here = dirname(fileURLToPath(import.meta.url));
const tailwindRoot = resolve(here, '..');

export const THEME_FILES = {
  default: resolve(tailwindRoot, 'fresco/themes/default.css'),
  interview: resolve(tailwindRoot, 'fresco/themes/interview.css'),
  studio: resolve(tailwindRoot, 'fresco/themes/studio.css'),
} as const;

const PALETTE_FILE = resolve(tailwindRoot, 'shared/colors.css');
const THEME_TOKENS_FILE = resolve(tailwindRoot, 'fresco/theme.css');

// ---------------------------------------------------------------------------
// CSS reading
// ---------------------------------------------------------------------------

type Block = { selectors: string[]; declarations: Map<string, string> };

function stripComments(css: string) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

function normaliseSelector(selector: string) {
  return selector.replace(/\s+/g, ' ').replace(/"/g, "'").trim();
}

function splitTop(text: string, isSeparator: (char: string) => boolean) {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of text) {
    if (char === '(') depth++;
    if (char === ')') depth--;
    if (depth === 0 && isSeparator(char)) {
      if (current.trim() !== '') parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim() !== '') parts.push(current.trim());
  return parts;
}

/**
 * Every rule that directly holds declarations, with its comma-separated
 * selector list. At-rule wrappers (`@layer`, `@media`) are walked through, not
 * recorded; their own selectors never matter to a token lookup.
 */
function parseBlocks(css: string): Block[] {
  const blocks: Block[] = [];
  const stack: { prelude: string; declarations: Map<string, string> }[] = [];
  let buffer = '';
  let parenDepth = 0;

  const flushDeclaration = () => {
    const top = stack.at(-1);
    const text = buffer.trim();
    buffer = '';
    if (!top || text === '') return;
    const colon = text.indexOf(':');
    if (colon === -1) return;
    top.declarations.set(
      text.slice(0, colon).trim(),
      text.slice(colon + 1).trim(),
    );
  };

  for (const char of stripComments(css)) {
    if (char === '(') parenDepth++;
    if (char === ')') parenDepth--;
    if (parenDepth === 0 && char === '{') {
      stack.push({ prelude: buffer.trim(), declarations: new Map() });
      buffer = '';
    } else if (parenDepth === 0 && char === '}') {
      flushDeclaration();
      const closed = stack.pop();
      if (
        closed &&
        closed.declarations.size > 0 &&
        !closed.prelude.startsWith('@')
      ) {
        blocks.push({
          selectors: splitTop(closed.prelude, (c) => c === ',').map(
            normaliseSelector,
          ),
          declarations: closed.declarations,
        });
      }
    } else if (parenDepth === 0 && char === ';') {
      flushDeclaration();
    } else {
      buffer += char;
    }
  }
  return blocks;
}

const blockCache = new Map<string, Block[]>();
function blocksOf(file: string) {
  let blocks = blockCache.get(file);
  if (!blocks) {
    blocks = parseBlocks(readFileSync(file, 'utf8'));
    blockCache.set(file, blocks);
  }
  return blocks;
}

/**
 * The custom properties `selector` declares in `file`, merged in source order
 * (a later declaration of the same property wins). Throws if the selector or
 * its custom properties are not there, so a renamed selector cannot make a
 * scope silently empty.
 */
function declarationsFor(file: string, selector: string) {
  const wanted = normaliseSelector(selector);
  const merged = new Map<string, string>();
  let matched = 0;
  for (const block of blocksOf(file)) {
    if (!block.selectors.includes(wanted)) continue;
    matched++;
    for (const [name, value] of block.declarations) {
      if (name.startsWith('--')) merged.set(name, value);
    }
  }
  if (matched === 0 || merged.size === 0) {
    throw new Error(
      `No custom properties found for \`${selector}\` in ${file}`,
    );
  }
  return merged;
}

/** `--color-*` aliases that `theme.css` publishes next to the palette. */
function themeColorAliases() {
  const aliases = new Map<string, string>();
  const css = stripComments(readFileSync(THEME_TOKENS_FILE, 'utf8'));
  for (const match of css.matchAll(/(--color-[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    const [, name, value] = match;
    if (name && value) aliases.set(name, value.trim());
  }
  return aliases;
}

// ---------------------------------------------------------------------------
// Scopes: one themed element, with the cascade and inheritance a browser gives
// ---------------------------------------------------------------------------

/**
 * One element's custom properties. `declared` is the cascade on that element
 * (selectors that match it, in precedence order); anything it does not declare
 * is inherited from `parent`'s *computed* value. A declaration's `var()`s are
 * substituted against the element the declaration sits on, which is why the
 * theme files restate derived tokens in every scope.
 */
export class Scope {
  readonly name: string;
  private readonly declared: Map<string, string>;
  private readonly parent: Scope | undefined;
  private readonly computedCache = new Map<string, string | undefined>();
  private readonly inProgress = new Set<string>();

  constructor(
    name: string,
    layers: ReadonlyMap<string, string>[],
    parent?: Scope,
  ) {
    this.name = name;
    this.parent = parent;
    this.declared = new Map();
    for (const layer of layers) {
      for (const [property, value] of layer) this.declared.set(property, value);
    }
  }

  /** Every custom property visible on this element, own or inherited. */
  propertyNames(): string[] {
    return [
      ...new Set([
        ...this.declared.keys(),
        ...(this.parent?.propertyNames() ?? []),
      ]),
    ];
  }

  has(property: string) {
    return this.computed(property) !== undefined;
  }

  /** The computed value: `var()` substituted, nothing else evaluated. */
  computed(property: string): string | undefined {
    if (this.computedCache.has(property))
      return this.computedCache.get(property);
    let result: string | undefined;
    const declaration = this.declared.get(property);
    if (declaration === undefined) {
      result = this.parent?.computed(property);
    } else {
      if (this.inProgress.has(property)) {
        throw new Error(
          `Cyclic custom property ${property} in scope ${this.name}`,
        );
      }
      this.inProgress.add(property);
      try {
        result = this.substitute(declaration);
      } finally {
        this.inProgress.delete(property);
      }
    }
    this.computedCache.set(property, result);
    return result;
  }

  /** Replaces every `var(--x[, fallback])` in `text` with this scope's value. */
  substitute(text: string): string {
    let output = '';
    let index = 0;
    while (index < text.length) {
      const start = text.indexOf('var(', index);
      if (start === -1) {
        output += text.slice(index);
        break;
      }
      output += text.slice(index, start);
      let depth = 0;
      let end = start + 3;
      for (; end < text.length; end++) {
        if (text[end] === '(') depth++;
        if (text[end] === ')') {
          depth--;
          if (depth === 0) break;
        }
      }
      const inner = text.slice(start + 4, end);
      const comma = inner.indexOf(',');
      const property = (comma === -1 ? inner : inner.slice(0, comma)).trim();
      const fallback = comma === -1 ? undefined : inner.slice(comma + 1).trim();
      const value = this.computed(property);
      if (value === undefined && fallback === undefined) {
        throw new Error(`${property} is not defined in scope ${this.name}`);
      }
      output += value ?? this.substitute(fallback ?? '');
      index = end + 1;
    }
    return output;
  }

  /** Parses `text` (which may use `var()`) as a colour in this scope. */
  color(text: string): Color {
    return parseColor(this.substitute(text));
  }

  token(property: string): Color {
    const value = this.computed(property);
    if (value === undefined) {
      throw new Error(`${property} is not defined in scope ${this.name}`);
    }
    return parseColor(value);
  }
}

// ---------------------------------------------------------------------------
// Colour expressions
// ---------------------------------------------------------------------------

const CHANNEL_PERCENT_SCALE = { l: 1, c: 0.4, h: 1, alpha: 1 } as const;
type Channel = keyof typeof CHANNEL_PERCENT_SCALE;

/** `calc()` over numbers and the relative-colour keywords. */
function evaluateChannel(
  expression: string,
  channel: Channel,
  keywords: Record<string, number>,
): number {
  const tokens = expression.match(
    /\d*\.?\d+(?:e[+-]?\d+)?(?:%|deg)?|[a-z]+|[-+*/()]/gi,
  );
  if (!tokens || tokens.join('') !== expression.replace(/\s+/g, '')) {
    throw new Error(`Cannot evaluate channel \`${expression}\``);
  }
  let position = 0;
  const peek = () => tokens[position];
  const next = () => tokens[position++];

  const primary = (): number => {
    const token = next();
    if (token === undefined)
      throw new Error(`Unexpected end of \`${expression}\``);
    if (token === '(') {
      const value = sum();
      if (next() !== ')') throw new Error(`Unbalanced \`${expression}\``);
      return value;
    }
    if (token === '-') return -primary();
    if (token === '+') return primary();
    if (/^\d|^\./.test(token)) {
      if (token.endsWith('%')) {
        return (
          (Number.parseFloat(token) / 100) * CHANNEL_PERCENT_SCALE[channel]
        );
      }
      return Number.parseFloat(token);
    }
    const lowered = token.toLowerCase();
    if (lowered === 'calc') return primary();
    if (lowered === 'none') return 0;
    const keyword = keywords[lowered];
    if (keyword === undefined) {
      throw new Error(`Unknown keyword \`${token}\` in \`${expression}\``);
    }
    return keyword;
  };
  const product = (): number => {
    let value = primary();
    while (peek() === '*' || peek() === '/') {
      const operator = next();
      const right = primary();
      value = operator === '*' ? value * right : value / right;
    }
    return value;
  };
  const sum = (): number => {
    let value = product();
    while (peek() === '+' || peek() === '-') {
      const operator = next();
      const right = product();
      value = operator === '+' ? value + right : value - right;
    }
    return value;
  };

  const result = sum();
  if (position !== tokens.length) {
    throw new Error(`Trailing tokens in \`${expression}\``);
  }
  return result;
}

function functionArguments(text: string, name: string) {
  const prefix = `${name}(`;
  if (!text.toLowerCase().startsWith(prefix) || !text.endsWith(')'))
    return undefined;
  return text.slice(prefix.length, -1).trim();
}

/** Parses a fully substituted CSS colour (no `var()` left). */
export function parseColor(raw: string): Color {
  const text = raw.trim();
  if (text.includes('var('))
    throw new Error(`Unsubstituted var() in \`${text}\``);

  const oklchArguments = functionArguments(text, 'oklch');
  if (oklchArguments !== undefined) return parseOklch(oklchArguments);

  const mixArguments = functionArguments(text, 'color-mix');
  if (mixArguments !== undefined) return parseColorMix(mixArguments);

  if (/^(white|black)$/i.test(text) || /^#[0-9a-f]{3,8}$/i.test(text)) {
    return new Color(text);
  }
  throw new Error(`Unsupported colour \`${text}\``);
}

function parseOklch(args: string): Color {
  let parts = splitTop(args, (c) => /\s/.test(c));
  const keywords: Record<string, number> = {};
  if (parts[0] === 'from') {
    const origin = parts[1];
    if (origin === undefined)
      throw new Error(`Missing origin in oklch(${args})`);
    const [l, c, h] = parseColor(origin).to('oklch').coords;
    Object.assign(keywords, {
      l: l ?? 0,
      c: c ?? 0,
      h: h ?? 0,
      alpha: parseColor(origin).alpha ?? 1,
    });
    parts = parts.slice(2);
  }
  const slash = parts.indexOf('/');
  const channels = slash === -1 ? parts : parts.slice(0, slash);
  const alphaExpression = slash === -1 ? undefined : parts[slash + 1];
  if (channels.length !== 3) throw new Error(`Cannot read oklch(${args})`);
  const [l, c, h] = (['l', 'c', 'h'] as const).map((channel, index) =>
    evaluateChannel(channels[index] ?? '', channel, keywords),
  );
  const alpha =
    alphaExpression === undefined
      ? 1
      : evaluateChannel(alphaExpression, 'alpha', keywords);
  return new Color('oklch', [l ?? 0, c ?? 0, h ?? 0], alpha);
}

type MixOperand = { colour: Color; percent: number | undefined };

function parseMixOperand(operand: string): MixOperand {
  const words = splitTop(operand, (c) => /\s/.test(c));
  const percent = words.find((word) => word.endsWith('%'));
  const colour = words.filter((word) => word !== percent).join(' ');
  return {
    colour: parseColor(colour),
    percent: percent === undefined ? undefined : Number.parseFloat(percent),
  };
}

function parseColorMix(args: string): Color {
  const [method, ...operands] = splitTop(args, (c) => c === ',');
  const interpolation = /^in (oklab|oklch)(?: shorter hue)?$/.exec(
    method ?? '',
  );
  const [firstText, secondText] = operands;
  if (
    !interpolation ||
    firstText === undefined ||
    secondText === undefined ||
    operands.length !== 2
  ) {
    throw new Error(`Unsupported color-mix(${args})`);
  }
  const space = interpolation[1] === 'oklab' ? 'oklab' : 'oklch';
  const first = parseMixOperand(firstText);
  const second = parseMixOperand(secondText);

  // Omitted percentages complete the other to 100%; both omitted is 50/50.
  const secondShare =
    second.percent ?? (first.percent === undefined ? 50 : 100 - first.percent);
  const firstShare = first.percent ?? 100 - secondShare;
  if (firstShare + secondShare !== 100) {
    throw new Error(`color-mix(${args}) does not sum to 100%`);
  }
  return Color.mix(first.colour, second.colour, secondShare / 100, {
    space,
    hue: 'shorter',
    outputSpace: 'oklch',
  });
}

// ---------------------------------------------------------------------------
// Contrast
// ---------------------------------------------------------------------------

const clipChannel = (channel: number | null) =>
  Math.min(1, Math.max(0, channel ?? 0));

const alphaOf = (color: Color) => color.alpha ?? 1;

/**
 * The colour as 0-1 sRGB, clipped channel by channel. That is what a browser
 * paints for an `oklch()` value outside the sRGB gamut on an sRGB display
 * (Chromium clips; it does not run the CSS Color 4 chroma-reduction mapper).
 * A P3 display shows such a colour slightly more saturated, so the ratios here
 * are the sRGB-display worst case the comments in the theme files also record.
 *
 * Throws on a translucent colour: its on-screen colour depends on what is
 * behind it, so the caller has to composite it first (`compositeOver`).
 */
export function toDisplayColor(color: Color): Color {
  if (alphaOf(color) < 1) {
    throw new Error(
      `${color.toString()} is translucent; composite it over its backdrop before measuring`,
    );
  }
  const [r, g, b] = color.to('srgb').coords;
  return new Color('srgb', [clipChannel(r), clipChannel(g), clipChannel(b)]);
}

/**
 * Paints `color` (at its own opacity times `alpha`) over `backdrop`, blending
 * in gamma-encoded sRGB as a browser does. The backdrop must be opaque.
 */
export function compositeOver(
  color: Color,
  alpha: number,
  backdrop: Color,
): Color {
  const opacity = alphaOf(color) * alpha;
  const top = toDisplayColor(new Color(color.space, color.coords, 1)).coords;
  const bottom = toDisplayColor(backdrop).coords;
  const mixed = top.map((channel, index) => {
    return opacity * (channel ?? 0) + (1 - opacity) * (bottom[index] ?? 0);
  });
  return new Color('srgb', [mixed[0] ?? 0, mixed[1] ?? 0, mixed[2] ?? 0]);
}

/**
 * WCAG 2.x contrast ratio (the formula is unchanged in 2.2), at least 1.
 *
 * A translucent foreground is composited over the background it is drawn on.
 * A translucent background needs `pageBackdrop`, the opaque colour behind it;
 * without one the real colour cannot be known, so this throws rather than
 * measuring the colour as if it were opaque.
 */
export function contrastRatio(
  foreground: Color,
  background: Color,
  pageBackdrop?: Color,
): number {
  let opaqueBackground = background;
  if (alphaOf(background) < 1) {
    if (!pageBackdrop) {
      throw new Error(
        `${background.toString()} is translucent and no backdrop was given to composite it over`,
      );
    }
    opaqueBackground = compositeOver(background, 1, pageBackdrop);
  }
  const opaqueForeground =
    alphaOf(foreground) < 1
      ? compositeOver(foreground, 1, opaqueBackground)
      : foreground;
  return toDisplayColor(opaqueForeground).contrast(
    toDisplayColor(opaqueBackground),
    'WCAG21',
  );
}

// ---------------------------------------------------------------------------
// The scopes the three theme files define
// ---------------------------------------------------------------------------

export type ScopeName =
  | 'default-light'
  | 'default-dark'
  | 'interview'
  | 'interview-in-dark-host'
  | 'studio-light'
  | 'studio-dark'
  | 'studio-dark-from-host';

export function buildScopes(): Record<ScopeName, Scope> {
  const palette = declarationsFor(PALETTE_FILE, ':root');
  const aliases = themeColorAliases();
  const defaultRoot = declarationsFor(THEME_FILES.default, ':root');
  const defaultDarkBlock = declarationsFor(
    THEME_FILES.default,
    "[data-theme='dark']",
  );
  const interviewBlock = declarationsFor(
    THEME_FILES.interview,
    '[data-theme-interview]',
  );
  const studioBlock = declarationsFor(
    THEME_FILES.studio,
    '[data-theme-studio]',
  );
  const studioDarkBlock = declarationsFor(
    THEME_FILES.studio,
    "[data-theme-studio][data-theme='dark']",
  );
  const studioDarkHostBlock = declarationsFor(
    THEME_FILES.studio,
    "[data-theme='dark'] [data-theme-studio]",
  );

  // `<html>` in light mode and `<html data-theme='dark'>`: one element, so the
  // dark block is layered over `:root` (same specificity, later in source).
  const defaultLight = new Scope('default-light', [
    palette,
    aliases,
    defaultRoot,
  ]);
  const defaultDark = new Scope('default-dark', [
    palette,
    aliases,
    defaultRoot,
    defaultDarkBlock,
  ]);

  return {
    'default-light': defaultLight,
    'default-dark': defaultDark,
    // A themed region is a descendant of `<html>`, so it inherits computed
    // values from the root scope for anything it does not declare itself.
    'interview': new Scope('interview', [interviewBlock], defaultLight),
    'interview-in-dark-host': new Scope(
      'interview-in-dark-host',
      [interviewBlock],
      defaultDark,
    ),
    'studio-light': new Scope('studio-light', [studioBlock], defaultLight),
    // `data-theme='dark'` on the studio region itself...
    'studio-dark': new Scope(
      'studio-dark',
      [studioBlock, studioDarkBlock],
      defaultLight,
    ),
    // ...or on an ancestor, which the second selector of the same rule covers.
    'studio-dark-from-host': new Scope(
      'studio-dark-from-host',
      [studioBlock, studioDarkHostBlock],
      defaultDark,
    ),
  };
}

export function readThemeSource(file: string) {
  return readFileSync(file, 'utf8');
}
