import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

// Same rule as src/__tests__/packageImportBoundaries.test.ts: the jsdom
// environment gives this module no `file:` URL, so the package root comes from
// the runner's working directory and is asserted below rather than assumed.
const packageSource = join(process.cwd(), 'src');

/**
 * The `.tsx` this package ships, on the same terms `collectSourceFiles` uses
 * to decide what carries extractable copy: no `__tests__`, no stories. A
 * fixture is allowed to write its own English.
 */
function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === '__tests__' ? [] : sourceFiles(path);
    }
    if (!entry.name.endsWith('.tsx')) return [];
    if (entry.name.includes('.stories.')) return [];
    return [path];
  });
}

/**
 * Attributes whose value a researcher reads.
 *
 * `no-literal-string-in-jsx` sees only the text BETWEEN tags, so a sentence
 * written as an attribute — a field's `label`, a button's `aria-label`, a
 * placeholder — passes every lint this package runs and still renders English
 * to a Spanish reader. The first conversion pass missed 23 of them for exactly
 * that reason. This is the closed list of names that carry copy; a prop that
 * carries a class name, a variant token or an element id is not one of them.
 */
const COPY_ATTRIBUTES = [
  'alt',
  'aria-description',
  'aria-label',
  'aria-placeholder',
  'aria-roledescription',
  'aria-valuetext',
  'caption',
  'description',
  'emptyMessage',
  'hint',
  'itemLabel',
  'label',
  'placeholder',
  'summary',
  'title',
];

/**
 * One of those attributes given a literal rather than a formatted message.
 *
 * All three literal forms, because the point is that no way of WRITING the
 * string gets past: `label="…"`, `label={'…'}` and `label={`…`}` all render
 * the same untranslatable words. A value holding `{` is left alone — that is
 * an expression, which is what a converted call site looks like.
 */
const literalAttribute = new RegExp(
  String.raw`(?<![\w.$-])(${COPY_ATTRIBUTES.join('|')})\s*=\s*` +
    String.raw`(?:"([^"\n]*)"|'([^'\n]*)'|\{\s*(?:'([^'\n]*)'|"([^"\n]*)"|` +
    '`([^`\\n{]*)`' +
    String.raw`)\s*\})`,
  'g',
);

type Finding = Readonly<{ file: string; attribute: string; value: string }>;

function findingsIn(file: string, contents: string): Finding[] {
  return [...contents.matchAll(literalAttribute)].flatMap((match) => {
    const attribute = match[1];
    const value = match[2] ?? match[3] ?? match[4] ?? match[5] ?? match[6];
    if (attribute === undefined || value === undefined) return [];
    // An empty attribute is a deliberate suppression — `label=""` on a control
    // whose name comes from elsewhere — and carries no words to translate.
    if (value.trim() === '') return [];
    return [{ file, attribute, value }];
  });
}

/**
 * A file is CONVERTED once it declares message descriptors.
 *
 * Scoping the sweep this way is what lets it widen on its own: the moment a
 * split converts a module, that module comes under this guard, and nothing has
 * to remember to add it to a list here. A module still awaiting its split is
 * not a regression, and is not reported as one.
 */
const isConverted = (contents: string): boolean =>
  contents.includes('defineMessages');

describe('copy written as a JSX attribute', () => {
  it('is looking at this package’s own source', () => {
    expect(existsSync(join(packageSource, 'protocol-context.ts'))).toBe(true);
    expect(sourceFiles(packageSource).length).toBeGreaterThan(20);
  });

  it('finds every literal form, so no way of writing one is missed', () => {
    const written = [
      '<Field label="Attribute name" />',
      "<Field hint={'This name is exported'} />",
      '<Button aria-label={`Delete attribute`} />',
    ].join('\n');
    expect(findingsIn('fixture.tsx', written).map((f) => f.value)).toEqual([
      'Attribute name',
      'This name is exported',
      'Delete attribute',
    ]);
  });

  it('leaves a formatted message and an empty name alone', () => {
    const written = [
      '<Field label={intl.formatMessage(messages.nameLabel)} />',
      '<Field label="" />',
      '<Section title={props.title} />',
    ].join('\n');
    expect(findingsIn('fixture.tsx', written)).toEqual([]);
  });

  it('is not declared in any module that has been converted', () => {
    const findings = sourceFiles(packageSource).flatMap((file) => {
      const contents = readFileSync(file, 'utf8');
      if (!isConverted(contents)) return [];
      return findingsIn(relative(packageSource, file), contents);
    });

    expect(
      findings.map((f) => `${f.file}: ${f.attribute}="${f.value}"`),
    ).toEqual([]);
  });
});
