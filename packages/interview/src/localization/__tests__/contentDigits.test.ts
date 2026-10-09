import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

// A number a participant sees among the protocol's text is written in the
// protocol's digits, through `useContentFormat`. Only the interview's own
// navigation follows the browser's language, so only it may format a number
// with the interface's `Intl`.
const SOURCE = resolve(__dirname, '../..');

const NAVIGATION = ['components/StagesMenu.tsx'];

const APP_LOCALE_NUMBER = /intl\.formatNumber\(|<FormattedNumber\b/;

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === '__tests__' ? [] : sourceFiles(path);
    }
    return /\.tsx?$/.test(entry.name) &&
      !/\.(test|stories)\.tsx?$/.test(entry.name)
      ? [path]
      : [];
  });

describe('numbers shown in an interview', () => {
  it('are formatted in the interface language only by its navigation', () => {
    const formatting = sourceFiles(SOURCE)
      .filter((path) => APP_LOCALE_NUMBER.test(readFileSync(path, 'utf8')))
      .map((path) => relative(SOURCE, path));

    expect(formatting).toEqual(NAVIGATION);
  });
});
