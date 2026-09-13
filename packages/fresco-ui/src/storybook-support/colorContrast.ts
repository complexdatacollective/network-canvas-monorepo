/**
 * Measuring what a rendered colour is actually worth, from inside a browser
 * story.
 *
 * A play function can read a computed colour, but not how visible it is: the
 * theme writes its tokens in `oklch()`, Tailwind's opacity modifiers come back
 * as `color-mix()`, and a translucent boundary is only as visible as whatever
 * it is painted over. So nothing here parses colour text. Each colour is
 * painted onto a 1×1 canvas over a known backdrop and read back as pixels,
 * which is the browser's own colour conversion and its own compositing, in the
 * sRGB a screen shows — letting a story hold a boundary to the 3:1 that
 * identifying a control asks for, and fail when the boundary is faded below
 * it.
 */

type Rgb = { r: number; g: number; b: number };

const WHITE = 'rgb(255, 255, 255)';
const BLACK = 'rgb(0, 0, 0)';

let probe: HTMLElement | undefined;
let context: CanvasRenderingContext2D | undefined;

/**
 * The colour the browser resolves a declaration to, or `undefined` when the
 * declaration is not a colour at all.
 *
 * `color-mix()` and relative colour syntax are resolved at computed-value
 * time, so going through a real element is the only way past them; a
 * declaration the parser rejects leaves the property empty rather than
 * erroring, which is how a value that is not a colour — a length in the middle
 * of a `box-shadow`, say — is told apart from one that is.
 */
const resolveDeclaredColor = (color: string): string | undefined => {
  probe ??= document.body.appendChild(document.createElement('div'));
  probe.style.display = 'none';

  probe.style.backgroundColor = '';
  probe.style.backgroundColor = color;
  if (probe.style.backgroundColor === '') return undefined;

  return getComputedStyle(probe).backgroundColor;
};

const canvasContext = (): CanvasRenderingContext2D => {
  context ??=
    document.createElement('canvas').getContext('2d', {
      willReadFrequently: true,
    }) ?? undefined;

  if (!context) throw new Error('No 2D canvas context to read colours with.');
  return context;
};

/** One pixel of `color` painted over `backdrop`, in sRGB. */
const paintOver = (color: string, backdrop: string): Rgb => {
  const declared = resolveDeclaredColor(color);
  if (declared === undefined) throw new Error(`\`${color}\` is not a colour.`);

  const ctx = canvasContext();
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = backdrop;
  ctx.fillRect(0, 0, 1, 1);
  ctx.fillStyle = declared;
  ctx.fillRect(0, 0, 1, 1);

  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  if (r === undefined || g === undefined || b === undefined) {
    throw new Error(`The browser painted nothing for \`${color}\`.`);
  }

  return { r, g, b };
};

/**
 * How much of what is behind a colour it covers: 1 for an opaque colour, 0 for
 * `transparent`.
 *
 * Read from what the colour does rather than from its text, by painting it
 * over white and over black: the two agree only where the colour hides the
 * backdrop entirely.
 */
export function opacityOf(color: string): number {
  const onWhite = paintOver(color, WHITE);
  const onBlack = paintOver(color, BLACK);

  const shownThrough = Math.max(
    onWhite.r - onBlack.r,
    onWhite.g - onBlack.g,
    onWhite.b - onBlack.b,
  );

  return 1 - shownThrough / 255;
}

const toLinear = (channel: number): number => {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};

const relativeLuminance = ({ r, g, b }: Rgb): number =>
  0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);

/**
 * The WCAG contrast ratio between a colour and the opaque colour behind it.
 *
 * `color` is painted onto `backdrop` first, so a colour carrying an alpha
 * channel is measured as it is seen rather than as it is written.
 */
export function contrastRatio(color: string, backdrop: string): number {
  if (opacityOf(backdrop) !== 1) {
    throw new Error(`The backdrop \`${backdrop}\` is not opaque.`);
  }

  const front = relativeLuminance(paintOver(color, backdrop));
  const back = relativeLuminance(paintOver(backdrop, backdrop));

  return (Math.max(front, back) + 0.05) / (Math.min(front, back) + 0.05);
}

/** The top-level comma-separated parts of a computed value. */
const splitLayers = (value: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === '(') depth += 1;
    else if (character === ')') depth -= 1;
    else if (character === ',' && depth === 0) {
      parts.push(value.slice(start, index));
      start = index + 1;
    }
  }

  parts.push(value.slice(start));
  return parts;
};

/** The top-level whitespace-separated tokens of one shadow. */
const shadowTokens = (shadow: string): string[] => {
  const tokens: string[] = [];
  let depth = 0;
  let current = '';

  for (const character of shadow.trim()) {
    if (character === '(') depth += 1;
    if (character === ')') depth -= 1;

    if (depth === 0 && /\s/.test(character)) {
      if (current) tokens.push(current);
      current = '';
      continue;
    }

    current += character;
  }

  if (current) tokens.push(current);
  return tokens;
};

/**
 * The colour of the visible inset shadow in a computed `box-shadow`.
 *
 * Tailwind composes `box-shadow` out of every shadow utility at once, so the
 * computed value is a list in which the unused slots are fully transparent.
 * Reading the painted colour out of it — rather than trusting the class name
 * or one of Tailwind's own custom properties — is what lets a story measure
 * the boundary a reader actually sees.
 */
export function insetShadowColor(boxShadow: string): string {
  for (const shadow of splitLayers(boxShadow)) {
    if (!/(^|\s)inset(\s|$)/.test(shadow)) continue;

    for (const token of shadowTokens(shadow)) {
      if (token === 'inset') continue;

      try {
        if (opacityOf(token) > 0) return token;
      } catch {
        // A length, not a colour: keep looking along the shadow.
      }
    }
  }

  throw new Error(`No visible inset shadow in \`${boxShadow}\`.`);
}
