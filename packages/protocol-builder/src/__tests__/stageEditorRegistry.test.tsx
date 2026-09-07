import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  defineStageEditorPart,
  missingStageEditors,
  STAGE_TYPES,
} from '../stage-editor-contract.ts';
import type {
  StageEditorComponent,
  StageEditorProps,
  StageEditorRegistryPart,
} from '../stage-editor-contract.ts';
import {
  AWAITING_STAGE_EDITORS,
  composeStageEditorRegistry,
  DuplicateStageEditorError,
  stageEditorRegistry,
} from '../stageEditorRegistry.ts';
import { UnregisteredStageTypeError } from '../testing/incompleteRegistry.ts';
import { renderStageEditor } from '../testing/renderStageEditor.tsx';

const InformationEditor: StageEditorComponent<'Information'> = ({
  stageType,
}: StageEditorProps<'Information'>) => <p>{stageType} editor</p>;

const EgoFormEditor: StageEditorComponent<'EgoForm'> = ({
  stageType,
}: StageEditorProps<'EgoForm'>) => <p>{stageType} editor</p>;

/**
 * An editor that renders the host's chrome and nothing else, so a test can
 * read whether the slot reached it — and what it was called with.
 */
const ChromeEditor: StageEditorComponent<'Information'> = ({
  controller,
  actions,
}: StageEditorProps<'Information'>) => (
  <p>
    {actions?.({ controller, formId: controller.formId, readOnly: false }) ??
      'no chrome'}
  </p>
);

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
   * This module imports every family's part, so a part that imported anything
   * back from this one would close a cycle — and a cycle here is not a warning
   * but a crash, in whichever direction a program happens to enter it. Loading
   * the family module first leaves this one half-evaluated, and `REGISTRY_PARTS`
   * then reads a part binding that holds nothing yet.
   *
   * Reached through the family module deliberately, and with the module
   * registry reset so it is genuinely the first of the pair to be evaluated:
   * the static imports at the top of this file have already loaded them in the
   * safe order, which is the order that hides the fault.
   */
  it('composes whichever of the registry and a family part is loaded first', async () => {
    vi.resetModules();

    const { censusAndBinStageEditors } =
      await import('../editors/censusAndBinStageEditors.ts');
    const registry = await import('../stageEditorRegistry.ts');

    // Every family is composed into the registry whichever module loaded
    // first, so the part loaded ahead of it is present in full — the cycle
    // between a part and the registry never drops a claim.
    expect(Object.keys(registry.stageEditorRegistry)).toEqual(
      expect.arrayContaining(Object.keys(censusAndBinStageEditors)),
    );
    expect(Object.keys(registry.stageEditorRegistry)).not.toHaveLength(0);
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
   *
   * Both parts are ANNOTATED rather than written inline, because inline they
   * are two literals the compiler can compare: one says `Information` holds
   * nothing and the other says it holds an editor, and the merged type of the
   * two is `never` — which is the right answer for a package whose parts the
   * compiler can see. This is the other case, the one the runtime check exists
   * for: a registry a HOST composed out of values typed as parts, where the
   * key sets are no longer literals and nothing but the check itself can say
   * whether an entry claims anything.
   */
  it('does not count an entry a part left empty as a claim', () => {
    const empty: StageEditorRegistryPart = { Information: undefined };
    const claimed: StageEditorRegistryPart = { Information: InformationEditor };

    const registry = composeStageEditorRegistry(empty, claimed);

    expect(registry.Information).toBe(InformationEditor);
  });
});

/**
 * Families are still landing, on branches of their own, and each of them
 * edits the same two lists in `stageEditorRegistry.ts`. Written as one
 * entry per line in a fixed alphabetical order, three concurrent one-line
 * changes touch three different lines and merge; written any other way — a
 * list collapsed onto one line, two entries sharing a line, an order nobody
 * agrees on — every one of those merges is a conflict somebody resolves by
 * hand, in the file whose whole job is to say which interfaces have an editor.
 *
 * Read out of the source rather than out of the values, because the shape is
 * the point: the values are identical either way.
 */
describe('the two lists a family edits', () => {
  const source = readFileSync(
    join(process.cwd(), 'src', 'stageEditorRegistry.ts'),
    'utf8',
  );

  /** The lines between a list's own brackets, comments and blanks dropped. */
  const entriesOf = (name: string): string[] => {
    // Every family has landed, so a list may legitimately be empty, and an
    // empty one holds no entries for two families to collide on. Whether the
    // formatter leaves `[]` beside the name or wraps it onto the next line is
    // its decision and not a fact about merging — `AWAITING_STAGE_EDITORS`
    // crossed 80 columns and moved — so the whitespace after `=` is matched
    // rather than spelled.
    if (new RegExp(`const ${name} =\\s+\\[\\] as const`).test(source))
      return [];
    const body = new RegExp(
      `const ${name} =\\s+\\[\\n([\\s\\S]*?)\\n\\] as const`,
    ).exec(source)?.[1];
    if (body === undefined) {
      throw new Error(
        `${name} is not written as a list whose bracket opens on its own line, so a family adding an entry to it cannot be merged with another family doing the same.`,
      );
    }
    return body
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('//'));
  };

  it.each([
    {
      name: 'REGISTRY_PARTS',
      // An imported part, never an inline object: a family's part is declared
      // in the family's own module, and one identifier is one line.
      entry: /^[A-Za-z_$][\w$]*,$/,
      shape: 'an imported part name followed by a comma',
    },
    {
      name: 'AWAITING_STAGE_EDITORS',
      entry: /^'[A-Za-z]+',$/,
      shape: 'a quoted stage type followed by a comma',
    },
  ])('writes one entry per line in $name', ({ name, entry, shape }) => {
    for (const line of entriesOf(name)) {
      expect(line, `${name} lines hold ${shape}`).toMatch(entry);
    }
  });

  it.each(['REGISTRY_PARTS', 'AWAITING_STAGE_EDITORS'])(
    'keeps %s in one agreed order',
    (name) => {
      const entries = entriesOf(name);
      expect(entries).toEqual([...entries].toSorted());
    },
  );

  it('says how to add a family, where a family will look', () => {
    // Two lines, and which two. A recipe that stops matching the file is worse
    // than none, so it is checked rather than trusted.
    expect(source).toMatch(/ADDING A FAMILY IS TWO LINES/);
    expect(source).toMatch(/add it to `REGISTRY_PARTS`/);
    expect(source).toMatch(/from `AWAITING_STAGE_EDITORS`/);
  });
});

/**
 * The coverage machinery is a set of TYPES, so the only thing that can test it
 * is a compiler. `type-tests/` holds one project of deliberately wrong
 * registries and editors; this compiles it and reads which files the compiler
 * refused.
 *
 * The controls matter as much as the probes: `valid.ts` proves the machinery
 * is not simply refusing everything, and its `ClaimsExactlyTheseTwo` proves
 * `defineStageEditorPart` keeps a part's exact key set — the fact all three
 * registry probes rest on, and the one an annotated `const part:
 * StageEditorRegistryPart` destroys. `actionsSlot.ts` is the control for the
 * fourth probe: an editor may ignore the host's action chrome or forward it,
 * and only one that INSISTS on it is refused.
 *
 * `incompleteRegistry.ts` is the probe for the claim the dispatcher rests on:
 * that the parts cover the whole schema, which is what lets `StageEditor` look
 * an editor up without a branch for there being none. Its control is
 * `EveryStageTypeHasAnEditor` in `stageEditorRegistry.ts` — the same assertion
 * over the real parts, which compiles. `unknownEntry.ts` is its mirror: an
 * editor registered under an interface the schema does not have, which no
 * coverage check downstream can report because a key that is not a stage type
 * subtracts nothing from anything.
 *
 * `partFromRegistry.ts` is a probe about the import graph rather than about
 * coverage: the registry imports every family's part, so the helper a part is
 * declared with must not be reachable through the registry, or a family closes
 * the cycle again. Its control is every other probe in this project — they all
 * import that helper from `stage-editor-contract.ts` and all compile.
 */
describe('the compile-time coverage checks', () => {
  it('refuses a missing entry, a stale entry, an unknown interface, an uncovered schema, a duplicate claim, an editor that insists on chrome, and a part helper read from the registry', () => {
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
      'type-tests/incompleteRegistry.ts',
      'type-tests/missingEntry.ts',
      'type-tests/partFromRegistry.ts',
      'type-tests/requiredActions.ts',
      'type-tests/staleEntry.ts',
      'type-tests/unknownEntry.ts',
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
   * A registry that claims nothing is not a state a host can reach —
   * `StageEditor` takes a whole `StageEditorRegistry` and the package composes
   * one — so what is under test here is the harness's own refusal, which is
   * what makes "this family's part claims this interface" a claim a family
   * test can fail. It names the interface, so such a test fails saying which
   * one rather than on a section that is missing for no visible reason.
   */
  it('names the interface a part under test does not claim', () => {
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
      // An interface a landed family claims opens in that family's editor with
      // no registry passed at all, which is how a host reaches one. Every
      // family has landed, so no interface is left awaiting its editor; the
      // refusal for an interface nothing is registered for is pinned above
      // with an explicit empty registry.
      const harness = renderStageEditor({ stageId: 'information-1' });
      expect(harness.getByRole('textbox', { name: 'Stage name' })).toHaveValue(
        'Information',
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  /**
   * A host that reaches an editor through the dispatcher never names the
   * component, so this is the only route its own save button has into the
   * editor's slot. An editor mounted without one has to render nothing rather
   * than fail, because a spectator view is given no chrome at all.
   */
  it('hands the host’s action chrome to the editor it chose', () => {
    const withoutChrome = renderStageEditor({
      stageId: 'information-1',
      registry: { Information: ChromeEditor },
    });
    expect(withoutChrome.getByText('no chrome')).toBeInTheDocument();

    const withChrome = renderStageEditor({
      stageId: 'information-1',
      registry: { Information: ChromeEditor },
      actions: ({ formId, readOnly }) => `chrome for ${formId}, ${readOnly}`,
    });
    expect(
      withChrome.getByText('chrome for stage-form, false'),
    ).toBeInTheDocument();
  });

  /** The same slot, when a host names the editor instead of dispatching. */
  it('hands it to a named editor mounted directly', () => {
    const harness = renderStageEditor({
      stageId: 'information-1',
      editor: ChromeEditor,
      actions: ({ formId }) => `chrome for ${formId}`,
    });

    expect(harness.getByText('chrome for stage-form')).toBeInTheDocument();
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
