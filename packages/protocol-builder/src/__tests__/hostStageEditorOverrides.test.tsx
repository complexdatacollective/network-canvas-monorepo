import { describe, expect, it, vi } from 'vitest';

import type {
  StageEditorComponent,
  StageEditorProps,
} from '../stage-editor-contract.ts';
import { UnregisteredStageTypeError } from '../StageEditor.tsx';
import type * as stageEditorRegistryModule from '../stageEditorRegistry.ts';
import {
  stageEditorRegistry,
  stageEditorsWithHostOverrides,
} from '../stageEditorRegistry.ts';
import { renderStageEditor } from '../testing/renderStageEditor.tsx';

/**
 * The package registry, standing in for one that has families in it.
 *
 * No family has landed on this branch, so `stageEditorRegistry` is empty — and
 * a host registry replacing an empty registry is indistinguishable from one
 * merged over it. Every claim below is about what happens once it is NOT
 * empty, so the module is mocked to the state this is really about rather than
 * left until a family arrives to break it in a host.
 *
 * Only the composed registry is replaced; everything else the module exports
 * (`stageEditorsWithHostOverrides` included) is the real one, so what is under
 * test is the package's own merge and not a stand-in for it.
 *
 * The editors are built with `createElement` rather than JSX because this
 * factory runs while the module graph is still being evaluated, before this
 * file's own imports are guaranteed to have run.
 */
vi.mock('../stageEditorRegistry.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof stageEditorRegistryModule>();
  const { createElement } = await import('react');
  return {
    ...actual,
    stageEditorRegistry: Object.freeze({
      EgoForm: () => createElement('p', null, 'the package EgoForm editor'),
      Information: () =>
        createElement('p', null, 'the package Information editor'),
    }),
  };
});

const HostInformationEditor: StageEditorComponent<'Information'> = ({
  stageType,
}: StageEditorProps<'Information'>) => <p>the host {stageType} editor</p>;

/**
 * A host supplies a registry to add an interface it owns or to replace one the
 * package ships. Handed on as the whole registry to dispatch through, one
 * naming a single interface took every other editor away with it: the stage a
 * researcher opened next threw `UnregisteredStageTypeError` in the host, for
 * an interface the package has an editor for.
 */
describe('a host registry supplied to the dispatcher', () => {
  it('keeps the package editors for the interfaces it does not name', () => {
    const harness = renderStageEditor({
      stageId: 'ego-form-1',
      registry: { Information: HostInformationEditor },
    });

    expect(harness.getByText('the package EgoForm editor')).toBeInTheDocument();
  });

  it('is what edits the interfaces it does name', () => {
    const harness = renderStageEditor({
      stageId: 'information-1',
      registry: { Information: HostInformationEditor },
    });

    expect(
      harness.getByText('the host Information editor'),
    ).toBeInTheDocument();
  });

  it('leaves the package registry alone when a host supplies none', () => {
    const harness = renderStageEditor({ stageId: 'information-1' });

    expect(
      harness.getByText('the package Information editor'),
    ).toBeInTheDocument();
  });

  /**
   * The control: an interface NEITHER the package nor the host has an editor
   * for still throws, so the merge above is not simply making everything
   * renderable.
   */
  it('still names an interface neither of them registers', () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    try {
      expect(() =>
        renderStageEditor({
          stageId: 'sociogram-1',
          registry: { Information: HostInformationEditor },
        }),
      ).toThrow(UnregisteredStageTypeError);
    } finally {
      consoleError.mockRestore();
    }
  });
});

describe('merging a host registry over another', () => {
  const packageInformation = stageEditorRegistry.Information;
  const packageEgoForm = stageEditorRegistry.EgoForm;

  it('takes the host entry where both name an interface', () => {
    const merged = stageEditorsWithHostOverrides(stageEditorRegistry, {
      Information: HostInformationEditor,
    });

    expect(merged.Information).toBe(HostInformationEditor);
    expect(merged.EgoForm).toBe(packageEgoForm);
  });

  /**
   * An entry a host left empty claims nothing, the same reading a family part
   * gets: a key holding `undefined` is not a way to delete an editor the
   * package ships.
   */
  it('does not let an empty host entry delete a package editor', () => {
    const merged = stageEditorsWithHostOverrides(stageEditorRegistry, {
      Information: undefined,
    });

    expect(merged.Information).toBe(packageInformation);
  });

  it('answers with the base itself when a host supplies nothing', () => {
    expect(stageEditorsWithHostOverrides(stageEditorRegistry, undefined)).toBe(
      stageEditorRegistry,
    );
  });

  it('answers with a registry nothing can add to afterwards', () => {
    const merged = stageEditorsWithHostOverrides(stageEditorRegistry, {
      Information: HostInformationEditor,
    });

    expect(Object.isFrozen(merged)).toBe(true);
  });
});
