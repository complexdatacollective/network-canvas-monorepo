import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * `aria-grabbed` and `aria-dropeffect` were removed in ARIA 1.2 and no current
 * screen reader acts on them; axe flags both. What a drag is doing reaches
 * assistive technology through the live-region announcements in
 * `dnd/useAccessibilityAnnouncements.ts`, and the state sighted users see
 * lives in `data-*` attributes (`data-dragging`, `data-node-dragging`,
 * `data-drop-target-valid`).
 *
 * A comment asking the next author not to reintroduce them cannot make that
 * true; this can. It scans every TypeScript source file in the workspace, in
 * both spellings an attribute can take: the DOM attribute (`aria-grabbed`) and
 * the React DOM property (`ariaGrabbed`).
 */
const REPO_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../..',
);
const SCANNED_ROOTS = ['packages', 'apps'];
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist']);

const RETIRED_ARIA_ATTRIBUTE = /aria-?(?:grabbed|dropeffect)/i;

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    // Dot directories are tool output and caches (.next, .turbo), never
    // source. `Dirent` reports a symlink as neither a file nor a directory, so
    // a link cannot send the walk in a loop.
    if (entry.isDirectory()) {
      return SKIPPED_DIRECTORIES.has(entry.name) || entry.name.startsWith('.')
        ? []
        : sourceFiles(join(directory, entry.name));
    }
    return entry.isFile() && /\.tsx?$/.test(entry.name)
      ? [join(directory, entry.name)]
      : [];
  });

const files = SCANNED_ROOTS.flatMap((root) =>
  sourceFiles(join(REPO_ROOT, root)),
);

describe('retired ARIA drag attributes', () => {
  it('finds the workspace source to scan', () => {
    // Without this, a bad REPO_ROOT would make the assertion below vacuous.
    expect(files.length).toBeGreaterThan(1000);
    expect(
      files.map((file) => relative(REPO_ROOT, file).split('\\').join('/')),
    ).toContain('packages/fresco-ui/src/utils/finalFocus.ts');
  });

  it('appears in no source file', () => {
    const self = fileURLToPath(import.meta.url);
    const offenders = files
      .filter((file) => file !== self)
      .filter((file) =>
        RETIRED_ARIA_ATTRIBUTE.test(readFileSync(file, 'utf-8')),
      )
      .map((file) => relative(REPO_ROOT, file));

    expect(offenders).toEqual([]);
  });

  it.each([
    ['a JSX attribute', '<Node aria-grabbed={true} />'],
    ['a quoted prop key', "{ 'aria-dropeffect': 'move' }"],
    ['a selector', "document.querySelector('[aria-grabbed]')"],
    ['a camelCase property', 'const props = { ariaDropEffect: "move" };'],
    ['a camelCase DOM property', 'element.ariaGrabbed = "true";'],
  ])('would catch %s if it came back', (_label, source) => {
    // The oracle above is a negative assertion, so prove the matcher fires.
    expect(RETIRED_ARIA_ATTRIBUTE.test(source)).toBe(true);
  });

  it('leaves the state attributes that replaced them alone', () => {
    expect(
      RETIRED_ARIA_ATTRIBUTE.test(
        '<Node aria-pressed aria-selected data-dragging />',
      ),
    ).toBe(false);
  });
});
