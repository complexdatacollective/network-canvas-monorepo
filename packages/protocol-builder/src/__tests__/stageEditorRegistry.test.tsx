import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { missingStageEditors, STAGE_TYPES } from '../stage-editor-contract.ts';
import type {
  StageEditorComponent,
  StageEditorProps,
} from '../stage-editor-contract.ts';
import { UnregisteredStageTypeError } from '../StageEditor.tsx';
import {
  AWAITING_STAGE_EDITORS,
  composeStageEditorRegistry,
  defineStageEditorPart,
  DuplicateStageEditorError,
  stageEditorRegistry,
} from '../stageEditorRegistry.ts';
import { renderStageEditor } from '../testing/renderStageEditor.tsx';

const InformationEditor: StageEditorComponent<'Information'> = ({
  stageType,
}: StageEditorProps<'Information'>) => <p>{stageType} editor</p>;

const EgoFormEditor: StageEditorComponent<'EgoForm'> = ({
  stageType,
}: StageEditorProps<'EgoForm'>) => <p>{stageType} editor</p>;

describe('composing the registry from family parts', () => {
  it('merges the parts each family exports', () => {
    const registry = composeStageEditorRegistry(
      defineStageEditorPart({ Information: InformationEditor }),
      defineStageEditorPart({ EgoForm: EgoFormEditor }),
    );

    expect(Object.keys(registry).toSorted()).toEqual([
      'EgoForm',
      'Information',
    ]);
    expect(missingStageEditors(registry)).not.toContain('Information');
  });

  it('answers with a registry nothing can add to afterwards', () => {
    const registry = composeStageEditorRegistry({
      Information: InformationEditor,
    });

    expect(Object.isFrozen(registry)).toBe(true);
  });

  /**
   * The list is also a compile-time fact — see
   * `UnregisteredStageTypesAreListed`, which stops a stage type being added to
   * the schema with nothing rendering it. This is the other half: that the
   * list describes the registry the package actually ships.
   */
  it('says the same thing at runtime as the type system says at build time', () => {
    expect(missingStageEditors(stageEditorRegistry)).toEqual([
      ...AWAITING_STAGE_EDITORS,
    ]);
  });

  it('accounts for every schema stage type exactly once', () => {
    expect(
      [
        ...AWAITING_STAGE_EDITORS,
        ...Object.keys(stageEditorRegistry),
      ].toSorted(),
    ).toEqual([...STAGE_TYPES].toSorted());
  });

  /**
   * Nothing chooses between two families that both think they own an
   * interface: whichever won would edit stages the other family's researchers
   * are looking at, and the disagreement would never surface.
   */
  it('refuses an interface two families both claim', () => {
    expect(() =>
      composeStageEditorRegistry(
        { Information: InformationEditor },
        { EgoForm: EgoFormEditor },
        { Information: InformationEditor },
      ),
    ).toThrow(DuplicateStageEditorError);
    expect(() =>
      composeStageEditorRegistry(
        { Information: InformationEditor },
        { Information: InformationEditor },
      ),
    ).toThrow(/"Information"/);
  });

  /**
   * A key present but holding nothing claims nothing, which is the same
   * reading `missingStageEditors` takes of the composed registry.
   */
  it('does not count an entry a part left empty as a claim', () => {
    const registry = composeStageEditorRegistry(
      { Information: undefined },
      { Information: InformationEditor },
    );

    expect(registry.Information).toBe(InformationEditor);
  });
});

/**
 * The coverage machinery is a set of TYPES, so the only thing that can test it
 * is a compiler. `type-tests/` holds one project of deliberately wrong
 * registries; this compiles it and reads which files the compiler refused.
 *
 * The control matters as much as the probes: `valid.ts` proves the machinery
 * is not simply refusing everything, and its `ClaimsExactlyTheseTwo` proves
 * `defineStageEditorPart` keeps a part's exact key set — the fact all three
 * probes rest on, and the one an annotated `const part: StageEditorRegistryPart`
 * destroys.
 */
describe('the compile-time coverage checks', () => {
  it('refuses a missing entry, a stale entry and a duplicate claim', () => {
    const packageRoot = join(import.meta.dirname, '..', '..');
    let output = '';
    try {
      execFileSync(
        'node_modules/.bin/tsc',
        ['--noEmit', '-p', 'type-tests/tsconfig.json'],
        { cwd: packageRoot, encoding: 'utf8', stdio: 'pipe' },
      );
    } catch (error: unknown) {
      output = compilerOutput(error);
    }

    // Read as a set of files rather than as messages: the wording of a TS
    // diagnostic is not ours to depend on, but which file it lands in is
    // exactly what each probe is about.
    expect(filesWithErrors(output)).toEqual([
      'type-tests/duplicateEntry.ts',
      'type-tests/missingEntry.ts',
      'type-tests/staleEntry.ts',
    ]);
  });
});

function compilerOutput(error: unknown): string {
  if (typeof error !== 'object' || error === null) return '';
  const stdout = Reflect.get(error, 'stdout');
  const stderr = Reflect.get(error, 'stderr');
  return `${typeof stdout === 'string' ? stdout : ''}${
    typeof stderr === 'string' ? stderr : ''
  }`;
}

function filesWithErrors(output: string): string[] {
  const files = new Set<string>();
  for (const line of output.split('\n')) {
    const match = /^(\S+?)\(\d+,\d+\): error TS\d+:/.exec(line);
    if (match?.[1] !== undefined) files.add(match[1]);
  }
  return [...files].toSorted();
}

describe('dispatching to a named editor', () => {
  it('renders the editor the registry names for the open stage', () => {
    const harness = renderStageEditor({
      stageId: 'information-1',
      registry: { Information: InformationEditor },
    });

    expect(harness.getByText('Information editor')).toBeInTheDocument();
  });

  /**
   * Thrown rather than reported: there is no editor to fall back to, and
   * rendering nothing would leave a researcher on an empty page with no
   * account of why.
   */
  it('names the interface nothing is registered for', () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    try {
      expect(() =>
        renderStageEditor({ stageId: 'information-1', registry: {} }),
      ).toThrow(UnregisteredStageTypeError);
      expect(() =>
        renderStageEditor({ stageId: 'information-1', registry: {} }),
      ).toThrow(/"Information" interface/);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('is the package registry when a host does not supply one', () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    try {
      // Every stage type is still awaiting its family, so the package's own
      // registry cannot render anything yet — and says so rather than
      // rendering a blank page.
      expect(() => renderStageEditor({ stageId: 'information-1' })).toThrow(
        UnregisteredStageTypeError,
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  /**
   * The dispatcher takes no stage type of its own, so the only way to reach a
   * different editor is to open a different stage. A host that could pass one
   * could render a Sociogram editor over a name generator's document.
   */
  it('reads the stage type from the session, so one registry serves both', () => {
    const registry = { EgoForm: EgoFormEditor, Information: InformationEditor };

    expect(
      renderStageEditor({ stageId: 'ego-form-1', registry }).getByText(
        'EgoForm editor',
      ),
    ).toBeInTheDocument();
    expect(
      renderStageEditor({ stageId: 'information-1', registry }).getByText(
        'Information editor',
      ),
    ).toBeInTheDocument();
  });
});
