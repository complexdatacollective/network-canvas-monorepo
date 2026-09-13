import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { sourceFiles, sourcePath } from './packageSource.ts';

/**
 * Architect's button styles, held as a rule about this package's source.
 *
 * Architect expresses what a button is FOR through `color` on the filled
 * variant — primary to create or submit, default to cancel, destructive to
 * remove — and uses `variant="outline"` and `variant="dashed"` nowhere at all
 * (73 call sites in 39 files at `@codaco/architect@8.2.5`). The package was
 * rebuilt from the schema rather than from Architect, and reached for outline
 * 19 times and dashed twice, so a researcher who moved between the codebook
 * and a stage editor met two different button vocabularies.
 *
 * Written as a source scan rather than a render assertion because the defect
 * is the SHAPE of a call site: a new section copying an old one is exactly how
 * outline came back the first time, and no rendered surface can be asked about
 * a component nobody has written yet.
 */

/**
 * The components this rule is about: everything in the package that renders
 * as a button and takes fresco-ui's `variant` axis.
 *
 * `Pill` and `Badge` are NOT here, and that is the whole exemption: each has
 * its own unrelated `outline` — a hairline chip rather than a hollow button —
 * and neither is a control. Naming them here rather than pattern-matching
 * "things with a variant prop" is what keeps the exemption from widening: a
 * component added to this list is a decision somebody made in a diff.
 */
const BUTTON_TAGS = ['Button', 'MotionButton', 'IconButton', 'SubmitButton'];

/** Named so the exemption is a fact of the file rather than an omission. */
const EXEMPT_FROM_THIS_RULE = ['Badge', 'Pill'];

/** The two Architect never uses. */
const REFUSED_VARIANTS = ['outline', 'dashed'];

/**
 * The text of one call site, from `<Name` or `buttonVariants(` to its own end.
 *
 * Scanned rather than matched with `[^>]*>`, because a `>` inside an attribute
 * expression — `onClick={() => …}` is on most of these call sites — would end
 * the match early and hide every attribute after it, which is precisely where
 * `variant` tends to sit. `closing` is what ends the site: `>` for a JSX tag,
 * `)` for a call. Either way the scan tracks brace, bracket, paren and string
 * nesting, so an over-read cannot reach a LATER call site's `variant` and
 * report it against this one.
 */
function callSiteText(
  source: string,
  from: number,
  closing: '>' | ')',
): string | undefined {
  let depth = 0;
  let quote: string | undefined = undefined;
  for (let index = from; index < source.length; index += 1) {
    const character = source[index];
    if (quote !== undefined) {
      if (character === quote && source[index - 1] !== '\\') quote = undefined;
      continue;
    }
    if (character === '"' || character === "'" || character === '`') {
      quote = character;
      continue;
    }
    if (character === '{' || character === '[') depth += 1;
    else if (character === '}' || character === ']') depth -= 1;
    else if (character === '(')
      depth += closing === ')' && index === from ? 0 : 1;
    else if (character === ')') {
      if (closing === ')' && depth === 0) return source.slice(from, index);
      depth -= 1;
    } else if (character === closing && depth === 0) {
      return source.slice(from, index);
    }
  }
  return undefined;
}

/**
 * The text of what one `variant` is set TO, from the first character of the
 * value to its end.
 *
 * A JSX expression (`variant={…}`) runs to the brace that closes it; a quoted
 * value is the literal itself; anything else — a `cva` argument's
 * `variant: cond ? 'a' : 'b',` — runs to the comma or closing brace that ends
 * the property. Nesting is tracked either way, so a value holding a call or an
 * object of its own is read whole rather than cut at its first `}` or `,`.
 */
function variantValueText(text: string, from: number): string | undefined {
  const opening = text[from];
  if (opening === undefined) return undefined;

  // A value written as the literal itself ends with that literal.
  if (opening === '"' || opening === "'" || opening === '`') {
    for (let index = from + 1; index < text.length; index += 1) {
      if (text[index] === opening && text[index - 1] !== '\\') {
        return text.slice(from, index + 1);
      }
    }
    return text.slice(from);
  }

  // Anything else is an expression: a JSX one ends at the brace that opened
  // it, and a property's value at the comma or the brace that ends it. Either
  // way the scan tracks nesting and strings, so a call or an object inside the
  // value is read whole rather than cut at its first `}` or `,`.
  const braced = opening === '{';
  let depth = 0;
  let quote: string | undefined = undefined;
  for (let index = from; index < text.length; index += 1) {
    const character = text[index];
    if (quote !== undefined) {
      if (character === quote && text[index - 1] !== '\\') quote = undefined;
      continue;
    }
    if (character === '"' || character === "'" || character === '`') {
      quote = character;
      continue;
    }
    if (character === '{' || character === '[' || character === '(') {
      depth += 1;
      continue;
    }
    if (character === '}' || character === ']' || character === ')') {
      if (depth === 0) return text.slice(from, index);
      depth -= 1;
      if (braced && depth === 0) return text.slice(from, index + 1);
      continue;
    }
    if (!braced && depth === 0 && character === ',') {
      return text.slice(from, index);
    }
  }
  return text.slice(from);
}

/**
 * Every `variant` this call site asks for, written any way it can be.
 *
 * Read as the whole VALUE rather than as a quoted word, because the refused
 * style comes back through an expression as readily as through a literal:
 * `variant={locked ? 'outline' : 'default'}` is a call site asking for
 * outline, and a matcher that only saw a directly quoted value reported the
 * package clean while that stood in it. Every string literal inside the value
 * counts, so a conditional naming a refused style on either branch is caught
 * on the branch that names it; a value that names none — `variant={chosen}` —
 * yields nothing, which is all a source scan can say about a word it cannot
 * see.
 */
function variantsIn(text: string): string[] {
  const variants: string[] = [];
  for (const match of text.matchAll(/\bvariant\s*[=:]\s*/g)) {
    const value = variantValueText(text, match.index + match[0].length);
    if (value === undefined) continue;
    for (const literal of value.matchAll(/['"`]([a-z-]+)['"`]/g)) {
      const variant = literal[1];
      if (variant !== undefined) variants.push(variant);
    }
  }
  return variants;
}

type Offender = { where: string; tag: string; variant: string };

type Scan = { offenders: Offender[]; tagCount: number; variants: string[] };

/**
 * One file's button call sites, and what each asks the variant to be.
 *
 * Taking the source as text rather than a path is what lets the rule itself be
 * tested: a reintroduction can be handed to it and the offender asserted,
 * which no scan of a clean package can prove about itself.
 */
function scanSource(source: string, where: string): Scan {
  const offenders: Offender[] = [];
  const variants: string[] = [];
  let tagCount = 0;

  const record = (tag: string, variant: string) => {
    variants.push(variant);
    if (REFUSED_VARIANTS.includes(variant))
      offenders.push({ where, tag, variant });
  };

  for (const tag of BUTTON_TAGS) {
    const opening = new RegExp(`<${tag}(?![A-Za-z0-9_])`, 'g');
    for (const match of source.matchAll(opening)) {
      const attributes = callSiteText(source, match.index, '>');
      if (attributes === undefined) continue;
      tagCount += 1;
      for (const variant of variantsIn(attributes)) record(tag, variant);
    }
  }

  for (const match of source.matchAll(/buttonVariants\s*\(/g)) {
    const call = callSiteText(source, match.index + match[0].length - 1, ')');
    tagCount += 1;
    for (const variant of variantsIn(call ?? ''))
      record('buttonVariants', variant);
  }

  return { offenders, tagCount, variants };
}

/** Every button call site in the package, and what it asks the variant to be. */
function buttonVariantCallSites(): Scan & { files: string[] } {
  const offenders: Offender[] = [];
  const variants: string[] = [];
  const files: string[] = [];
  let tagCount = 0;

  for (const file of sourceFiles(undefined, { withStories: true })) {
    const where = sourcePath(file);
    files.push(where);
    const scan = scanSource(readFileSync(file, 'utf8'), where);
    offenders.push(...scan.offenders);
    variants.push(...scan.variants);
    tagCount += scan.tagCount;
  }

  return { offenders, tagCount, variants, files };
}

describe('button styles in this package', () => {
  const { offenders, tagCount, variants, files } = buttonVariantCallSites();

  it('asks for no variant Architect never uses', () => {
    expect(
      offenders.map(
        ({ where, tag, variant }) => `${where}: <${tag} variant="${variant}">`,
      ),
    ).toEqual([]);
  });

  /**
   * The scan above passes on an empty file list and on a regex that has
   * stopped matching, so what it read is asserted too: the package's button
   * call sites, and at least one `variant` among them — without which the
   * rule would be reporting nothing rather than finding nothing.
   */
  it('read this package’s button call sites before saying so', () => {
    expect(tagCount).toBeGreaterThan(40);
    expect(variants).toContain('text');
  });

  /**
   * `Pill` and `Badge` keep an `outline` of their own. They are exempt by
   * being absent from `BUTTON_TAGS`, so this states the pair the rule is
   * deliberately not about — and fails if somebody quietly adds a third.
   */
  it('exempts only the two chips, by name', () => {
    expect(EXEMPT_FROM_THIS_RULE).toEqual(['Badge', 'Pill']);
    expect(
      BUTTON_TAGS.filter((tag) => EXEMPT_FROM_THIS_RULE.includes(tag)),
    ).toEqual([]);
  });

  /**
   * The rule read against a reintroduction, because a clean package proves
   * nothing about a matcher: the scan above is equally silent on a file with
   * no offender and on a matcher that stopped seeing them.
   *
   * The conditional is the shape that got past the first version of this
   * rule — it only ever saw a value written as a quoted word — and it is the
   * shape a refused style comes back in, because a call site that has grown a
   * disabled or a selected state has grown an expression with it.
   */
  it('catches a refused variant however the call site writes it', () => {
    const reintroduced = `
      <Button variant={locked ? 'outline' : 'default'} onClick={() => close()}>
        Cancel
      </Button>
      <IconButton variant="dashed" label="Remove" />
      <SubmitButton className={cx('x', open && 'y')} variant={\`outline\`} />
      <Button variant={{ true: 'outline', false: 'text' }[String(open)]} />
      <Button variant={chosen} color="primary" />
      <Button color="destructive">Delete</Button>
      buttonVariants({ variant: ghost ? 'outline' : 'text', size: 'sm' })
    `;

    const scan = scanSource(reintroduced, 'made-up.tsx');

    expect(
      scan.offenders.map(({ tag, variant }) => `${tag}:${variant}`),
    ).toEqual([
      'Button:outline',
      'Button:outline',
      'IconButton:dashed',
      'SubmitButton:outline',
      'buttonVariants:outline',
    ]);
    // The values it could not read are not guessed at, and the ones that are
    // allowed are not reported: both would make the rule noise.
    expect(scan.variants).toContain('default');
    expect(scan.variants).not.toContain('primary');
  });

  /**
   * What the widened set is FOR: `testing/` holds the host every stage
   * editor's stories run in, and its stories are photographed by Chromatic
   * like any other. The directory's non-story files stay out — they are
   * fixtures — so this asserts both sides of that line rather than the
   * exclusion simply being gone.
   */
  it('reads the stories under testing/, and none of its fixtures', () => {
    expect(files).toContain('testing/StageEditorStoryHost.stories.tsx');
    expect(files).not.toContain('testing/renderStageEditor.tsx');
    expect(files).not.toContain('testing/StageEditorStoryHost.tsx');
  });
});
