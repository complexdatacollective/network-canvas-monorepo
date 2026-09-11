import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { packageSource, sourceFiles, sourcePath } from './packageSource.ts';

/**
 * Where a form field lives, and that it is shown.
 *
 * Two rules, both Josh's (2026-09-11): "every new form Field component in
 * protocol-builder should have a storybook story in the protocol-builder
 * package", and, of the nine that had grown up beside the sections using them,
 * "these fields should all be in a /fields folder within protocol-builder".
 *
 * They are one rule read twice. A control that decides what a researcher can
 * say about their protocol is worth looking at on its own — empty, holding a
 * value, refused, handed to somebody who may not edit — and a control filed
 * beside its single caller is neither found by the next section that needs it
 * nor visibly missing its story. Checked as TEXT rather than by importing
 * anything: the point is what the tree looks like, and a rule enforced by
 * imports would pass the moment a field stopped being imported.
 */

const fieldsDirectory = join(packageSource, 'fields');

/** A `.tsx` is a component module; a `.ts` beside it is the helper it uses. */
const componentModules = (directory: string): string[] =>
  sourceFiles(directory).filter((file) => file.endsWith('.tsx'));

describe('every form field lives in `fields/` and has a story', () => {
  it('is looking at this package’s own fields', () => {
    // Asserted rather than assumed: the runner's working directory is what
    // `packageSource` is built from, so a runner that moves would otherwise
    // make both rules below pass by finding nothing at all.
    expect(existsSync(join(fieldsDirectory, 'VariablePickerField.tsx'))).toBe(
      true,
    );
    expect(componentModules(fieldsDirectory).length).toBeGreaterThan(10);
  });

  /**
   * Every component in `fields/` is shown in Storybook.
   *
   * The story is the field's own documentation and its only interaction test
   * outside the sections that happen to mount it: `test:storybook` runs each
   * play function in a real browser, which no unit test here does.
   */
  it('gives every field component a co-located story', () => {
    const withoutAStory = componentModules(fieldsDirectory)
      .filter((file) => !existsSync(file.replace(/\.tsx$/, '.stories.tsx')))
      .map(sourcePath);

    expect(withoutAStory).toEqual([]);
  });

  /**
   * And no field is filed anywhere else.
   *
   * Named by suffix because that is the name the package gives a form field:
   * a `*Field.tsx` under `editors/` or `sections/` is a control that one
   * section found first, and the next section that wants it reimplements it.
   */
  it('keeps no `*Field.tsx` component outside `fields/`', () => {
    const misfiled = componentModules(packageSource)
      .map(sourcePath)
      .filter(
        (path) => path.endsWith('Field.tsx') && !path.startsWith('fields/'),
      );

    expect(misfiled).toEqual([]);
  });
});
