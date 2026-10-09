import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

// A number a participant sees among the protocol's text is written in the
// protocol's digits, through `useContentFormat`. Only the interview's own
// navigation follows the browser's language, so only it may format a number
// any other way.
const SOURCE = resolve(__dirname, '../..');

const NAVIGATION = ['components/StagesMenu.tsx'];

// The content formatter itself, which builds the protocol's `Intl` formats.
const CONTENT_FORMAT = 'localization/contentFormat.ts';

// The interface's `intl` (whatever it is named, across lines), a number
// format built by hand, or the runtime's own.
const OWN_NUMBER_FORMAT =
  /\w*[iI]ntl\s*\.\s*formatNumber\(|\bformatNumber\s*[,}][^;]*=\s*use\w*Intl\(|<FormattedNumber\b|NumberFormat\(|\.toLocaleString\(/;

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
      .map((path) => relative(SOURCE, path))
      .filter((path) => path !== CONTENT_FORMAT)
      .filter((path) =>
        OWN_NUMBER_FORMAT.test(readFileSync(resolve(SOURCE, path), 'utf8')),
      );

    expect(formatting).toEqual(NAVIGATION);
  });
});
