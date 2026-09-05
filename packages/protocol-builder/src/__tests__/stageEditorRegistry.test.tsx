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
});

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
