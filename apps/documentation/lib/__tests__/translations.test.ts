// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { locales } from '~/lib/i18n/locales';
import {
  findTranslationProblems,
  gitBlobId,
  messageSourcesPath,
  readTranslatedFrom,
  writeTranslatedFrom,
} from '~/lib/i18n/translations';

const appRoot = join(__dirname, '..', '..');

describe('documentation translations', () => {
  // The guard: every translation matches today's English, and every published
  // language is complete. A failure lists each file and what to do about it;
  // see translation/README.md.
  it('match the English and are complete for every published language', () => {
    const problems = findTranslationProblems({
      root: appRoot,
      published: locales,
    }).map(({ locale, file, problem }) => `[${locale}] ${file} ${problem}`);
    expect(problems).toEqual([]);
  });
});

describe('gitBlobId', () => {
  it('matches git hash-object', () => {
    const dir = mkdtempSync(join(tmpdir(), 'blob-'));
    const file = join(dir, 'page.en.mdx');
    const content = '---\ntitle: Ünïcode\n---\n\nBody\n';
    writeFileSync(file, content);
    const expected = execFileSync('git', ['hash-object', file], {
      encoding: 'utf-8',
    }).trim();
    rmSync(dir, { recursive: true });
    expect(gitBlobId(content)).toBe(expected);
  });
});

describe('translatedFrom frontmatter', () => {
  const page = '---\ntitle: Título\nnavOrder: 2\n---\n\nCuerpo\n';

  it('adds the field without touching the rest of the page', () => {
    const stamped = writeTranslatedFrom(page, 'abc123');
    expect(stamped).toBe(
      '---\ntitle: Título\nnavOrder: 2\ntranslatedFrom: abc123\n---\n\nCuerpo\n',
    );
    expect(readTranslatedFrom(stamped)).toBe('abc123');
  });

  it('replaces an existing value', () => {
    const restamped = writeTranslatedFrom(
      writeTranslatedFrom(page, 'old'),
      'new',
    );
    expect(readTranslatedFrom(restamped)).toBe('new');
    expect(restamped.match(/translatedFrom/g)).toHaveLength(1);
  });

  it('reads nothing from a page without the field', () => {
    expect(readTranslatedFrom(page)).toBeUndefined();
    expect(readTranslatedFrom('No frontmatter, translatedFrom: x')).toBe(
      undefined,
    );
  });
});

describe('findTranslationProblems', () => {
  let root: string;
  const write = (path: string, content: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  };
  const english = '---\ntitle: Intro\n---\n\nHello\n';
  const problems = (published: string[] = ['en']) =>
    findTranslationProblems({ root, published }).map(
      ({ locale, file, problem }) => `${locale} ${file} ${problem}`,
    );

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'docs-i18n-'));
    write('docs/start/intro.en.mdx', english);
    write(
      'docs/start/metadata.json',
      JSON.stringify({
        type: 'section',
        localeLabels: { en: 'Start' },
        localeIndexFiles: { en: 'intro.en.mdx' },
      }),
    );
    write('messages/en.json', JSON.stringify({ Nav: { home: 'Home' } }));
  });
  afterEach(() => rmSync(root, { recursive: true }));

  it('accepts an English-only site', () => {
    expect(problems()).toEqual([]);
  });

  it('accepts a translation stamped from the current English', () => {
    write(
      'docs/start/intro.es.mdx',
      writeTranslatedFrom(
        '---\ntitle: Intro\n---\n\nHola\n',
        gitBlobId(english),
      ),
    );
    expect(problems()).toEqual([]);
  });

  it('reports a translation once its English changes', () => {
    write(
      'docs/start/intro.es.mdx',
      writeTranslatedFrom(
        '---\ntitle: Intro\n---\n\nHola\n',
        gitBlobId(english),
      ),
    );
    write('docs/start/intro.en.mdx', english.replace('Hello', 'Hi there'));
    expect(problems()).toEqual([
      expect.stringMatching(
        /^es docs\/start\/intro\.es\.mdx is stale: .*git diff [0-9a-f]{40} docs\/start\/intro\.en\.mdx/,
      ),
    ]);
  });

  it('reports a translation that records no English', () => {
    write('docs/start/intro.es.mdx', '---\ntitle: Intro\n---\n\nHola\n');
    expect(problems()).toEqual([
      expect.stringContaining('es docs/start/intro.es.mdx does not record'),
    ]);
  });

  it('reports a translation with no English page', () => {
    write(
      'docs/start/gone.es.mdx',
      writeTranslatedFrom('---\ntitle: X\n---\n', 'abc'),
    );
    expect(problems()).toEqual([
      'es docs/start/gone.es.mdx has no English page beside it',
    ]);
  });

  it('allows an unpublished language to be incomplete', () => {
    write('messages/es.json', JSON.stringify({}));
    expect(problems()).toEqual([]);
  });

  it('requires every page, label and message of a published language', () => {
    expect(problems(['en', 'es'])).toEqual([
      'es docs/start/intro.en.mdx has no es translation',
      'es docs/start/metadata.json has no es entry in localeLabels',
      'es docs/start/metadata.json has no es entry in localeIndexFiles',
      'es messages/es.json is missing',
    ]);
  });

  it('reports a message whose English changed since it was translated', () => {
    write('messages/es.json', JSON.stringify({ Nav: { home: 'Inicio' } }));
    write(
      messageSourcesPath(root, 'es').slice(root.length + 1),
      JSON.stringify({ Nav: { home: 'Home page' } }),
    );
    expect(problems()).toEqual([
      'es messages/es.json Nav.home is stale: translated from "Home page", the English now says "Home"',
    ]);
  });

  it('reports messages with no recorded English and ones English dropped', () => {
    write(
      'messages/es.json',
      JSON.stringify({ Nav: { home: 'Inicio', old: 'Viejo' } }),
    );
    expect(problems()).toEqual([
      'es translation/sources/es.json does not record which English Nav.home was translated from',
      'es messages/es.json has message Nav.old, which English no longer has',
    ]);
  });
});
