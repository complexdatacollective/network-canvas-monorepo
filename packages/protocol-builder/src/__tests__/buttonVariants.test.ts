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
 * Every `variant` this call site asks for, written either way it can be:
 * `variant="outline"` on a tag, `variant: 'outline'` in a `cva` argument.
 */
function variantsIn(text: string): string[] {
  return [...text.matchAll(/\bvariant\s*[=:]\s*\{?\s*['"]([a-z-]+)['"]/g)]
    .map((match) => match[1])
    .filter((variant): variant is string => variant !== undefined);
}

type Offender = { where: string; tag: string; variant: string };

/** Every button call site in the package, and what it asks the variant to be. */
function buttonVariantCallSites(): {
  offenders: Offender[];
  tagCount: number;
  variants: string[];
} {
  const offenders: Offender[] = [];
  const variants: string[] = [];
  let tagCount = 0;

  for (const file of sourceFiles(undefined, { withStories: true })) {
    const source = readFileSync(file, 'utf8');
    const where = sourcePath(file);

    for (const tag of BUTTON_TAGS) {
      const opening = new RegExp(`<${tag}(?![A-Za-z0-9_])`, 'g');
      for (const match of source.matchAll(opening)) {
        const attributes = callSiteText(source, match.index, '>');
        if (attributes === undefined) continue;
        tagCount += 1;
        for (const variant of variantsIn(attributes)) {
          variants.push(variant);
          if (REFUSED_VARIANTS.includes(variant)) {
            offenders.push({ where, tag, variant });
          }
        }
      }
    }

    for (const match of source.matchAll(/buttonVariants\s*\(/g)) {
      const call = callSiteText(source, match.index + match[0].length - 1, ')');
      tagCount += 1;
      for (const variant of variantsIn(call ?? '')) {
        variants.push(variant);
        if (REFUSED_VARIANTS.includes(variant)) {
          offenders.push({ where, tag: 'buttonVariants', variant });
        }
      }
    }
  }

  return { offenders, tagCount, variants };
}

describe('button styles in this package', () => {
  const { offenders, tagCount, variants } = buttonVariantCallSites();

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
});
