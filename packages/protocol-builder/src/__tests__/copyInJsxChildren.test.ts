import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { sourceFiles, sourcePath } from './packageSource.ts';

/**
 * Copy written between the tags, which is the other half of the same defect
 * `copyInJsxAttributes` guards.
 *
 * That scan reads JSX ATTRIBUTES and says so in its own header: a label, a
 * placeholder or an accessible name is an attribute, and nothing else in the
 * repo can see one. Children are the class it deliberately does not read, on
 * the grounds that `formatjs/no-literal-string-in-jsx` reads them — except
 * this package does not have that rule turned on, so nothing read them at all.
 * Four researcher-facing sentences shipped as `<legend>` and `<p>` children of
 * the attribute editor's two newest fieldsets, and every guard that existed
 * walked past them:
 *
 * - the attribute scan reads attributes;
 * - `testing/localeSweep.ts` builds its English index from the extraction
 *   catalog, so a string with no id is invisible to it BY CONSTRUCTION;
 * - the sweeps that mount real surfaces only see the surfaces they mount.
 *
 * The third is worth closing separately and is (`codebookLocale.test.tsx` now
 * opens the attribute editor once per answer shape). The first two cannot be
 * closed by a sweep at all: a catalog-driven reading can never report a
 * sentence that is not in the catalog. So this reads the SOURCE, the way
 * `copyInJsxAttributes` and `hostCopyOverrides` do, and asks a question that
 * needs no catalog — is there an English sentence sitting between two tags?
 */

/**
 * Comments, string literals and template literals blanked out, so what is left
 * is the file's tag structure.
 *
 * Blanked rather than deleted: every character is replaced by a space and
 * every newline kept, so a finding's line number is the line it is on. This is
 * what keeps the reading below conservative — an apostrophe in a comment, a
 * `>` inside a `className`, a sentence inside a `defineMessages` default all
 * become whitespace before anything looks for a tag.
 */
const structureOf = (source: string): string => {
  const blanked: string[] = [];
  let mode: 'code' | 'line' | 'block' | 'single' | 'double' | 'template' =
    'code';
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index] ?? '';
    const next = source[index + 1] ?? '';
    const keep = () => blanked.push(character);
    const drop = () => blanked.push(character === '\n' ? '\n' : ' ');
    if (mode === 'code') {
      if (character === '/' && next === '/') mode = 'line';
      else if (character === '/' && next === '*') mode = 'block';
      else if (character === "'") mode = 'single';
      else if (character === '"') mode = 'double';
      else if (character === '`') mode = 'template';
      if (mode === 'code') keep();
      else drop();
      continue;
    }
    drop();
    if (mode === 'line') {
      if (character === '\n') mode = 'code';
      continue;
    }
    if (mode === 'block') {
      if (character === '*' && next === '/') {
        blanked.push(' ');
        index += 1;
        mode = 'code';
      }
      continue;
    }
    // A quoted string ends at its own quote, and a backslash escapes whatever
    // follows it — including that quote and, in a template, a `${`.
    if (character === '\\') {
      blanked.push(next === '\n' ? '\n' : ' ');
      index += 1;
      continue;
    }
    if (
      (mode === 'single' && character === "'") ||
      (mode === 'double' && character === '"') ||
      (mode === 'template' && character === '`')
    ) {
      mode = 'code';
    }
  }
  return blanked.join('');
};

/**
 * What sits between a `>` and the next `<`, with no brace in between.
 *
 * A brace disqualifies the run because it is either an interpolation — the
 * shape converted copy takes, `{intl.formatMessage(...)}` — or ordinary code,
 * and neither is a literal sentence. That single condition is what lets a scan
 * with no idea whether it is inside JSX run over `.ts` files as well.
 */
const BETWEEN_TAGS = />([^<>{}]+)</gu;

const collapse = (text: string) => text.replaceAll(/\s+/gu, ' ').trim();

/**
 * The characters prose is written with.
 *
 * Anything else — a bracket, an operator, an underscore, a semicolon — says
 * the run is code rather than a sentence, and code is what a scan with no idea
 * whether it is inside JSX mostly finds: `Readonly<…>` closes with a `>` and
 * the next type parameter opens with a `<`, so a whole line of TypeScript
 * arrives here looking exactly like a text child.
 */
const PROSE = /^[\p{L}\p{N}\s.,:'’“”"!?()«»—–…-]+$/u;

/**
 * A `(` with something other than a space in front of it, which is a call and
 * never a parenthetical. This is what tells `Array.isArray(value)` from
 * `Year, month and day (YYYY-MM-DD)`.
 */
const CALL = /\S\(/u;

/**
 * Whether a run of text is an English sentence somebody wrote for a reader.
 *
 * Three words, a capital letter to start, and nothing in it a sentence would
 * not contain. Deliberately blunt: it is blind to a two-word heading, and the
 * alternative — reporting every run holding a letter — reports every generic
 * this package writes, and a guard that has to be argued with is a guard
 * somebody turns off. What it does catch is the shape all four of the
 * sentences that got past every other reading were written in, and the shape
 * any replacement for them would be written in too.
 *
 * A word is a run holding at least one letter, so punctuation between the
 * words of a sentence does not count as one.
 */
const isSentence = (text: string): boolean => {
  if (!/^\p{Lu}/u.test(text)) return false;
  if (!PROSE.test(text) || CALL.test(text)) return false;
  return text.split(' ').filter((word) => /\p{L}/u.test(word)).length >= 3;
};

/**
 * Runs that look like a sentence and are not copy.
 *
 * Empty, and kept for the reason `NOT_CONVERTED_YET` is: an entry is a claim
 * somebody has to defend, and an empty list says this package has none to
 * make. Anything added here names the exact text, so it cannot silently widen
 * to cover a sentence written next to it.
 */
const NOT_COPY: readonly string[] = [];

type Finding = Readonly<{ line: number; text: string }>;

/** The sentences one file hands a reader between its tags. */
const copyInSource = (source: string): Finding[] => {
  const structure = structureOf(source);
  const findings: Finding[] = [];
  for (const match of structure.matchAll(BETWEEN_TAGS)) {
    const run = match[1] ?? '';
    const text = collapse(run);
    if (!isSentence(text)) continue;
    if (NOT_COPY.includes(text)) continue;
    // Where the WORDS start, not where the tag closed: a child written on its
    // own lines under an opening tag is reported at the sentence, which is the
    // line somebody has to go and change.
    const start =
      (match.index ?? 0) + 1 + (run.length - run.trimStart().length);
    findings.push({
      line: structure.slice(0, start).split('\n').length,
      text,
    });
  }
  return findings;
};

describe('copy written between JSX tags', () => {
  it('is looking at enough of the package to be worth trusting', () => {
    expect(sourceFiles().length).toBeGreaterThan(20);
  });

  it('appears nowhere in this package’s converted source', () => {
    const findings = sourceFiles().flatMap((path) =>
      copyInSource(readFileSync(path, 'utf8')).map(
        (finding) => `${sourcePath(path)}:${finding.line} ${finding.text}`,
      ),
    );

    expect(findings).toEqual([]);
  });

  /**
   * The reading held in place, so widening or narrowing it stays as
   * falsifiable as the reading is.
   *
   * Every row is a judgement that could silently become wrong: a scan that
   * stopped blanking template literals would read the `>` and `<` inside one
   * as a pair of tags; one that stopped requiring a brace-free run would
   * report every `{intl.formatMessage(…)}` this package renders; one that
   * dropped the prose-character test would report a whole line of TypeScript
   * closing one type parameter and opening the next.
   */
  it('tells a sentence apart from the code written the same way', () => {
    const source = [
      'export function Editor() {',
      '  return (',
      '    <fieldset>',
      '      <legend className="font-heading mb-2 font-bold">',
      '        The two answers',
      '      </legend>',
      '      <p className="text-muted mb-4 text-sm">',
      '        Write what the participant chooses between. Left empty, they are',
      '        offered Yes and No.',
      '      </p>',
      '      <legend>{intl.formatMessage(messages.optionsLegend)}</legend>',
      '      <span className="text-destructive">*</span>',
      '      <Heading>{title}</Heading>',
      '      <p>Two words</p>',
      '      // The two answers, said in a comment nobody reads.',
      '      <p>{`The two answers, in a template`}</p>',
      '    </fieldset>',
      '  );',
      '}',
      'const wider = (a: number, b: number) => a > b && b < a;',
      "const held = '<p>The two answers, in a string</p>';",
      'const summary = `Answers > The two answers, in a template < end`;',
    ].join('\n');

    expect(copyInSource(source)).toEqual([
      { line: 5, text: 'The two answers' },
      {
        line: 8,
        text: 'Write what the participant chooses between. Left empty, they are offered Yes and No.',
      },
    ]);
  });
});
