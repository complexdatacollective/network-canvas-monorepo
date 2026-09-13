import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import StageEditorShell from '../form/StageEditorShell.tsx';
import { missingStageEditors, STAGE_TYPES } from '../stage-editor-contract.ts';
import type {
  StageEditorComponent,
  StageEditorProps,
} from '../stage-editor-contract.ts';
import {
  AWAITING_STAGE_EDITORS,
  composeStageEditorRegistry,
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

/**
 * An editor that forwards the host's chrome into the shell's slot and renders
 * nothing else, so a test can read whether the slot reached it — and what the
 * shell called it with. The stand-in when a host gave none says so, because
 * the shell renders an empty slot as nothing at all.
 */
const ChromeEditor: StageEditorComponent<'Information'> = ({
  actions,
}: StageEditorProps<'Information'>) => (
  <StageEditorShell actions={actions ?? (() => 'no chrome')}>
    <p>Information editor</p>
  </StageEditorShell>
);

describe('composing the registry from family parts', () => {
  it('merges the parts each family exports', () => {
    const registry = composeStageEditorRegistry(
      { Information: InformationEditor },
      { EgoForm: EgoFormEditor },
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
   * The state PR 3 reaches, asserted rather than inferred from the pair above.
   *
   * Those two hold the runtime list, the type-level list and the schema to each
   * other — which they would go on doing if a merge dropped an editor and its
   * stage type reappeared in `AWAITING_STAGE_EDITORS` together. This says the
   * only thing that pair cannot: there is nothing in either list.
   */
  it('leaves no interface without an editor', () => {
    expect([...AWAITING_STAGE_EDITORS]).toEqual([]);
    expect(missingStageEditors(stageEditorRegistry)).toEqual([]);
    expect(Object.keys(stageEditorRegistry)).toHaveLength(STAGE_TYPES.length);
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
   * Asked in BOTH orders, because they used to disagree. The scan for
   * duplicates skips an empty entry, so neither order was refused — but the
   * composition was an `Object.assign` per part, which copies an explicit
   * `undefined` like any other value. A part carrying an empty entry AFTER the
   * family that owns the interface therefore erased that family's editor, and
   * left the key present with nothing under it: the one state that renders as
   * `UnregisteredStageTypeError` while `AWAITING_STAGE_EDITORS` and every
   * claim test still say the interface has an editor.
   */
  it.each([
    {
      order: 'before',
      parts: [{ Information: undefined }, { Information: InformationEditor }],
    },
    {
      order: 'after',
      parts: [{ Information: InformationEditor }, { Information: undefined }],
    },
  ])(
    'does not count an empty entry $order the family as a claim',
    ({ parts }) => {
      const registry = composeStageEditorRegistry(...parts);

      expect(registry.Information).toBe(InformationEditor);
      expect(missingStageEditors(registry)).not.toContain('Information');
      expect(Object.hasOwn(registry, 'Information')).toBe(true);
    },
  );

  /**
   * The same reading, for a key NO part filled in: it stays off the composed
   * registry altogether rather than sitting on it holding nothing, so
   * `missingStageEditors` and `Object.keys` tell the same story.
   */
  it('leaves an entry every part left empty off the registry', () => {
    const registry = composeStageEditorRegistry(
      { Information: undefined },
      { EgoForm: EgoFormEditor },
    );

    expect(Object.keys(registry)).toEqual(['EgoForm']);
    expect(missingStageEditors(registry)).toContain('Information');
  });
});

/**
 * Editors are still landing, on branches of their own, and each of them
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

  /**
   * The lines between a list's own brackets, comments and blanks dropped.
   *
   * A list with nothing in it is written `[]`, because there are no entries to
   * keep on lines of their own — which is what `AWAITING_STAGE_EDITORS` is now
   * that every interface has an editor. Only empty brackets are allowed
   * through, with the whitespace the formatter chooses to put around them: a
   * list that HAS entries and was collapsed onto one line still fails, which
   * is the merge the shape is for.
   */
  const entriesOf = (name: string): string[] => {
    if (new RegExp(`const ${name} =\\s*\\[\\] as const`).test(source))
      return [];
    const body = new RegExp(
      `const ${name} = \\[\\n([\\s\\S]*?)\\n\\] as const`,
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
      // An imported part, never an inline object: a part is declared in the
      // editor's own module, and one identifier is one line.
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

  it('says how to add an editor, where whoever adds one will look', () => {
    // Two lines, and which two. A recipe that stops matching the file is worse
    // than none, so it is checked rather than trusted.
    expect(source).toMatch(/ADDING AN EDITOR IS TWO LINES/);
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
 * `defineStageEditor` keeps a part's exact key set — the fact all three
 * registry probes rest on, and the one an annotated `const part:
 * StageEditorRegistryPart` destroys. `actionsSlot.ts` is the control for the
 * fourth probe: an editor may ignore the host's action chrome or forward it,
 * and only one that INSISTS on it is refused.
 *
 * `partFromRegistry.ts` is a probe about the import graph rather than about
 * coverage: the registry imports every family's part, so the helper a part is
 * declared with must not be reachable through the registry, or a family closes
 * the cycle again. Its control is every other registry probe in this
 * project — they all reach that helper through
 * `editors/defineStageEditor.tsx` and all compile.
 */
describe('the compile-time coverage checks', () => {
  it('refuses a missing entry, a stale entry, a duplicate claim, an editor that insists on chrome, and a part helper read from the registry', () => {
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
      'type-tests/partFromRegistry.ts',
      'type-tests/requiredActions.ts',
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
   * Every interface now has an editor, so nothing this package composes can
   * reach `UnregisteredStageTypeError` any more: an explicit `{}` from a host
   * is merged OVER the package's registry rather than replacing it, and there
   * is no longer a stage type the package leaves out. What the throw says, and
   * that it names the interface, is asserted in
   * `hostStageEditorOverrides.test.tsx`, where the package registry is mocked
   * down to two interfaces and a third is genuinely unregistered.
   */
  it('is the package registry when a host does not supply one', () => {
    // An interface a landed family claims opens in that family's editor with
    // no registry passed at all, which is how a host reaches one.
    const harness = renderStageEditor({ stageId: 'information-1' });

    expect(harness.getByRole('textbox', { name: 'Stage name' })).toHaveValue(
      'Information',
    );
  });

  /**
   * A host that reaches an editor through the dispatcher never names the
   * component, so this is the only route its own save button has into the
   * editor's slot. An editor mounted without one has to render nothing rather
   * than fail, because a spectator view is given no chrome at all.
   */
  it('hands the host’s action chrome to the editor it chose', async () => {
    const withoutChrome = renderStageEditor({
      stageId: 'information-1',
      registry: { Information: ChromeEditor },
      // The harness fills the slot everywhere else — it is where the editor
      // publishes its sections — and the question here is what an editor given
      // nothing does, which only an empty slot can ask.
      withoutActionChrome: true,
    });
    expect(withoutChrome.getByText('no chrome')).toBeInTheDocument();

    const withChrome = renderStageEditor({
      stageId: 'information-1',
      registry: { Information: ChromeEditor },
      actions: ({ formId, readOnly }) => `chrome for ${formId}, ${readOnly}`,
    });
    // The id is this harness's own — one per mounted harness, so that two
    // forms never answer to the same one — and it is what the host is handed,
    // so it is read off the harness rather than written down here. Awaited,
    // because a host's save control is refused the stage until the acquire
    // has been answered: `readOnly` is true while it is still opening.
    expect(
      await withChrome.findByText(`chrome for ${withChrome.formId}, false`),
    ).toBeInTheDocument();
  });

  /** The same slot, when a host names the editor instead of dispatching. */
  it('hands it to a named editor mounted directly', () => {
    const harness = renderStageEditor({
      stageId: 'information-1',
      editor: ChromeEditor,
      actions: ({ formId }) => `chrome for ${formId}`,
    });

    expect(
      harness.getByText(`chrome for ${harness.formId}`),
    ).toBeInTheDocument();
  });

  /**
   * The dispatcher takes no stage type of its own, so the only way to reach a
   * different editor is to open a different stage. A host that could pass one
   * could render a Sociogram editor over a name generator's document.
   */
  it('reads the stage type from the open edit, so one registry serves both', () => {
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
