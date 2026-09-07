import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { sourceFiles, sourcePath } from './packageSource.ts';

/**
 * Copy handed to a component through a JSX ATTRIBUTE, which is the one class of
 * untranslated string nothing else in the repo can see.
 *
 * `formatjs/no-literal-string-in-jsx` reads CHILDREN — the words between the
 * tags — and this package does not have it turned on anyway. A label, a
 * placeholder or an accessible name is written as an attribute, so a section
 * could be converted end to end by every other measure and still render
 * `label="Attribute name"` in Spanish. Switching Storybook's Language control
 * to Español is what found 23 of them across six files; this is what stops
 * them coming back.
 *
 * Written as a source scan for the same reason `hostCopyOverrides` is: the
 * defect is the SHAPE of the value, and a new component copying an old one is
 * exactly how it would return.
 */

/**
 * The props whose value a researcher READS.
 *
 * A closed list, because the alternative — flagging every attribute holding a
 * space — has to know that `className`, `storageKey` and `viewBox` are not
 * copy, and that list is longer, less stable and wrong in a way nobody
 * notices. This one is wrong in a way somebody does: a new copy-bearing prop
 * is invisible here until it is added, so the sweep in
 * `localeSweep.test.tsx` renders the real surfaces under `es` as the
 * backstop, and finds anything this list has not learned about yet.
 */
const COPY_PROP =
  /^(?:aria-label|aria-description|label|placeholder|hint|title|description|term|alt|.*Label|.*Message|.*Text|.*Description|.*Placeholder|emptyState.*|addButton.*)$/;

/**
 * `prop="…"` and `prop={`…`}`, which is the same defect written two ways: the
 * template form is what an author reaches for the moment the sentence needs a
 * name in it, and it is the form that also loses the sentence's WORD ORDER to
 * whatever English happens to do.
 */
const ATTRIBUTE =
  /(?<![\w$])([A-Za-z_][\w:-]*)\s*=\s*(?:"([^"]*)"|\{`([^`]*)`\})/g;

/**
 * Whether the value is words rather than a token.
 *
 * Interpolations are stripped first, so `` `${name} attributes` `` is judged on
 * "attributes". Two consecutive letters is the threshold: it passes over
 * `aria-label={`${x}`}` and every symbol-only value, and catches every real
 * sentence, including one-word labels like `label="Label"`.
 */
const isCopy = (value: string): boolean =>
  /[A-Za-z]{2}/.test(value.replaceAll(/\$\{[^}]*\}/gu, ''));

type Finding = Readonly<{ file: string; line: number; text: string }>;

const findingsIn = (path: string): Finding[] => {
  const findings: Finding[] = [];
  readFileSync(path, 'utf8')
    .split('\n')
    .forEach((line, index) => {
      for (const match of line.matchAll(ATTRIBUTE)) {
        const [, name = '', quoted, templated] = match;
        const value = quoted ?? templated;
        if (value === undefined) continue;
        if (!COPY_PROP.test(name)) continue;
        if (!isCopy(value)) continue;
        findings.push({
          file: sourcePath(path),
          line: index + 1,
          text: `${name}=${JSON.stringify(value)}`,
        });
      }
    });
  return findings;
};

describe('copy written into a JSX attribute', () => {
  it('is looking at enough of the package to be worth trusting', () => {
    expect(sourceFiles().length).toBeGreaterThan(20);
  });

  it('appears nowhere in this package’s converted source', () => {
    const findings = sourceFiles()
      .flatMap(findingsIn)
      .map((finding) => `${finding.file}:${finding.line} ${finding.text}`);

    expect(findings).toEqual([]);
  });

  /**
   * The scan can see both shapes, and does not fire on the tokens that share
   * their syntax.
   *
   * Held in place because every line of it is a judgement that could silently
   * become wrong: a stricter `isCopy` would stop seeing `label="Label"`, and a
   * looser `COPY_PROP` would start reporting `className`.
   */
  it('tells copy apart from the tokens written the same way', () => {
    const lines = [
      '        label="Attribute name"',
      '        placeholder="Enter a label..."',
      '            label={`${subjectLabel} type name`}',
      '            aria-label={`Remove option ${index + 1}`}',
      '        emptyStateMessage="No options have been added yet."',
      '        className="flex w-full flex-col gap-3"',
      '        data-attribute-type="boolean"',
      '        name="variable-name"',
      '        color="destructive"',
      '        label={intl.formatMessage(messages.nameLabel)}',
      '        aria-label={`${count}`}',
    ];

    const seen = lines.flatMap((line) => {
      const found: string[] = [];
      for (const match of line.matchAll(ATTRIBUTE)) {
        const [, name = '', quoted, templated] = match;
        const value = quoted ?? templated;
        if (value === undefined) continue;
        if (COPY_PROP.test(name) && isCopy(value)) found.push(name);
      }
      return found;
    });

    expect(seen).toEqual([
      'label',
      'placeholder',
      'label',
      'aria-label',
      'emptyStateMessage',
    ]);
  });
});
