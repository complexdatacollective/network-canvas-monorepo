import { existsSync, readFileSync } from 'node:fs';
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

/**
 * The contract a form field is written against.
 *
 * `Field`'s `component` prop takes anything whose props are these — the value,
 * the change, `disabled`, `readOnly`, and the `aria-*` the field injects — so a
 * module naming this type IS a form field, whatever its file is called. Read as
 * text, like everything else here: a module that imports it under another name
 * still contains the identifier, and nothing that does not name it can be
 * mounted as a field without the compiler saying so.
 */
const FIELD_PROPS_CONTRACT = 'CreateFormFieldProps';

const namesTheFieldContract = (file: string): boolean =>
  readFileSync(file, 'utf8').includes(FIELD_PROPS_CONTRACT);

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
   * Asked two ways, because a name is not proof. The suffix is what the package
   * calls a form field — a `*Field.tsx` under `editors/` or `sections/` is a
   * control that one section found first, and the next section that wants it
   * reimplements it. But the suffix is also the easiest thing in the world to
   * avoid: `PassphraseRulesControl.tsx` sat beside its section implementing
   * `CreateFormFieldProps` and mounted through `component={…}`, and a rule that
   * read filenames called it something other than a field. So a module naming
   * the field-props contract is judged as a field too, whatever it is called —
   * that type is what `Field` mounts, so naming it is the thing a form field
   * actually does.
   *
   * Both rules are one list, so a module that breaks either is reported with
   * the path to move rather than with a rule number.
   */
  it('keeps no form field outside `fields/`', () => {
    const misfiled = sourceFiles(packageSource)
      .filter(
        (file) => file.endsWith('Field.tsx') || namesTheFieldContract(file),
      )
      .map(sourcePath)
      .filter((path) => !path.startsWith('fields/'));

    expect(misfiled).toEqual([]);
  });
});
