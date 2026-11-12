import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * A Latin fragment that starts with a dot (".netcanvas", ".csv", ".env")
 * inside right-to-left text is drawn with its dot on the wrong side. The bidi
 * algorithm gives a leading full stop no direction of its own, so it takes the
 * paragraph's: in Arabic the dot lands after the word, "netcanvas.".
 *
 * Inside `code`, `kbd`, `samp` and `pre` the theme isolates the run left to
 * right (tooling/tailwind/fresco/theme.css), so those are fine as they are.
 * Anywhere else the translation puts U+200E LEFT-TO-RIGHT MARK before the dot
 * (the Arabic glossary's rule), which gives the dot the direction of the word
 * after it. This scans every message catalog and every translated post for a
 * right-to-left string that breaks that rule.
 *
 * It lives at the repository root so that a change to any catalog re-runs it:
 * the `//#test:invariants` turbo task lists `packages/**` and `apps/**` as its
 * inputs.
 */
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SCANNED_ROOTS = ['packages', 'apps'];
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist']);

// Arabic (with its supplements and presentation forms), Hebrew, Syriac,
// Thaana and N'Ko: the scripts a right-to-left catalog is written in.
const RIGHT_TO_LEFT_SCRIPT = /[֐-ࣿיִ-﷿ﹰ-﻿]|\uD803[\uDE60-\uDE7F]/u;

// A full stop that begins a Latin fragment: it follows a space, the start of
// the text or punctuation, and a Latin letter follows it. A dot inside a word
// or a host name ("networkcanvas.com") follows a letter and is left alone, and
// a dot that follows U+200E (or U+2066 LEFT-TO-RIGHT ISOLATE) already has the
// direction it needs.
const BARE_LEADING_DOT = /(?<![\p{L}\p{N}\p{M}_\-./\\‎⁦])\.(?=[A-Za-z])/u;

// Runs that are isolated left to right where they are drawn: the elements the
// theme isolates, Markdown code spans and fences, and a rich-text tag that
// holds nothing but the fragment (`<tag1>.csv</tag1>`). A catalog cannot show
// what such a tag renders as; the convention, which Fresco's `renderCodeChunks`
// and Interviewer's `renderExtension` follow, is a `code` element or a
// `dir="ltr"` span, and the browser checks measure where the dot is drawn.
const ISOLATED_RUNS =
  /<(code|kbd|samp|pre)\b[^>]*>[\s\S]*?<\/\1>|<([A-Za-z][\w-]*)>\.[A-Za-z][A-Za-z0-9]*<\/\2>|```[\s\S]*?```|`[^`\n]*`/g;

/** The strings in a parsed JSON catalog, however deeply it nests them. */
const strings = (value) => {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === 'object') {
    return Object.values(value).flatMap(strings);
  }
  return [];
};

/** Each offending piece of text, with a little context around the dot. */
const bareLeadingDots = (text) => {
  if (!RIGHT_TO_LEFT_SCRIPT.test(text)) return [];
  const unisolated = text.replace(ISOLATED_RUNS, (run) =>
    ' '.repeat(run.length),
  );
  return [...unisolated.matchAll(new RegExp(BARE_LEADING_DOT, 'gu'))].map(
    (match) =>
      text
        .slice(Math.max(0, match.index - 20), match.index + 15)
        .replace(/\s+/g, ' '),
  );
};

// A catalog is a JSON file in a `locales` or `messages` directory; a post is a
// Markdown file named for its locale (`fresco-1.ar.md`). English sources and
// the recorded English beside each translation are skipped: they hold no
// right-to-left text, and reading them would only slow the scan.
const isCatalog = (path) =>
  /\/(?:locales|messages)\/[^/]+\.json$/.test(path) &&
  !path.endsWith('.source.json');
const isTranslatedPost = (path) =>
  /\.[a-z]{2,3}(?:-[A-Za-z]+)*\.mdx?$/.test(path);

const files = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) {
      return SKIPPED_DIRECTORIES.has(entry.name) || entry.name.startsWith('.')
        ? []
        : files(join(directory, entry.name));
    }
    if (!entry.isFile()) return [];
    const path = join(directory, entry.name);
    return isCatalog(path) || isTranslatedPost(path) ? [path] : [];
  });

const scanned = SCANNED_ROOTS.flatMap((root) => files(join(REPO_ROOT, root)));

const textsIn = (path) => {
  const source = readFileSync(path, 'utf-8');
  return path.endsWith('.json') ? strings(JSON.parse(source)) : [source];
};

describe('dot-leading Latin fragments in right-to-left text', () => {
  it('finds the Arabic catalogs and posts to scan', () => {
    // Without this, a bad REPO_ROOT or file filter would make the scan below
    // vacuous.
    const paths = scanned.map((path) => relative(REPO_ROOT, path));
    expect(paths).toContain('apps/architect/src/locales/ar.json');
    expect(paths).toContain('packages/app-i18n/src/locales/ar.json');
    expect(paths).toContain('apps/networkcanvas.com/messages/ar.json');
    expect(paths).toContain(
      'apps/networkcanvas.com/content/updates/fresco-1.ar.md',
    );
    expect(paths.some((path) => path.endsWith('.source.json'))).toBe(false);
  });

  it('keep their dot on the left of the word', () => {
    const offenders = scanned.flatMap((path) =>
      textsIn(path)
        .flatMap(bareLeadingDots)
        .map((context) => `${relative(REPO_ROOT, path)}: …${context}…`),
    );
    expect(offenders).toEqual([]);
  });

  it.each([
    ['a file extension after an Arabic word', 'يُرجى فتح ملف .netcanvas.'],
    ['one inside Arabic quotation marks', 'الملف «.csv» غير صالح'],
    ['one at the start of a Hebrew string', '.env הוא קובץ'],
    [
      'one in a rich-text tag that holds more than it',
      'افتح <b>ملف .netcanvas</b> الآن',
    ],
  ])('would catch %s', (_label, text) => {
    expect(bareLeadingDots(text)).toHaveLength(1);
  });

  it.each([
    ['one marked with U+200E', 'يُرجى فتح ملف ‎.netcanvas.'],
    ['one inside a code tag', 'افتح <code>.netcanvas</code> الآن'],
    ['one inside a Markdown code span', 'افتح `.netcanvas` الآن'],
    ['one that is all of a rich-text tag', 'اسحب ملف <tag1>.csv</tag1> هنا'],
    ['a host name', 'زيارة networkcanvas.com اليوم'],
    ['English text', 'Open a .netcanvas file.'],
  ])('leaves %s alone', (_label, text) => {
    expect(bareLeadingDots(text)).toEqual([]);
  });
});
