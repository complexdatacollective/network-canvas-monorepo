import { waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { StageEditorRegistry } from '../../stage-editor-contract.ts';
import type { FixtureStageId } from '../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import { alterEdgeFormStageEditor } from '../alter-edge-form/AlterEdgeFormStageEditor.ts';
import { alterFormStageEditor } from '../alter-form/AlterFormStageEditor.ts';
import { egoFormStageEditor } from '../ego-form/EgoFormStageEditor.ts';
import { informationStageEditor } from '../information/InformationStageEditor.ts';

/** See `formEditorHarness.tsx` for why the rich-text editor is stood in for. */
vi.mock('../../fields/RichTextField.tsx', () => ({
  default: ({
    id,
    name,
    value,
    onChange,
  }: Readonly<{
    id?: string;
    name?: string;
    value?: unknown;
    onChange?: (next: string) => void;
  }>) => (
    <input
      id={id}
      name={name}
      value={typeof value === 'string' ? value : ''}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
}));

type FormEditorCase = Readonly<{
  /** Names the case, and is what a failure reports. */
  interfaceName: string;
  stageId: FixtureStageId;
  /** The editor's own registry entry, dispatched through as a host would. */
  editor: Partial<StageEditorRegistry>;
  /** Every section the editor lists, in the order it lists them. */
  sections: readonly string[];
  /** The top-level stage keys those sections have a field for. */
  ownedKeys: readonly string[];
}>;

/**
 * What each of the four editors is written to compose, said here rather than
 * read out of the editor.
 *
 * A table derived from the section list would agree with it whatever it said,
 * including after a section was dropped or two of them swapped. These are the
 * outline entries a researcher reads down the side of the stage, so the
 * expected list is the interface as they meet it.
 */
const FORM_EDITORS: FormEditorCase[] = [
  {
    interfaceName: 'Information',
    stageId: 'information-1',
    editor: informationStageEditor,
    sections: [
      'Stage name',
      'Page content',
      'Skip logic',
      'Interviewer guidance',
    ],
    ownedKeys: ['items', 'label', 'title'],
  },
  {
    interfaceName: 'EgoForm',
    stageId: 'ego-form-1',
    editor: egoFormStageEditor,
    sections: [
      'Stage name',
      'Task introduction',
      'Form fields',
      'Skip logic',
      'Interviewer guidance',
    ],
    ownedKeys: ['form', 'introductionPanel', 'label'],
  },
  {
    interfaceName: 'AlterForm',
    stageId: 'alter-form-1',
    editor: alterFormStageEditor,
    sections: [
      'Stage name',
      'Node type',
      'Stage filter',
      'Task introduction',
      'Form fields',
      'Skip logic',
      'Interviewer guidance',
    ],
    ownedKeys: ['form', 'introductionPanel', 'label', 'subject'],
  },
  {
    interfaceName: 'AlterEdgeForm',
    stageId: 'alter-edge-form-1',
    editor: alterEdgeFormStageEditor,
    sections: [
      'Stage name',
      'Edge type',
      'Stage filter',
      'Task introduction',
      'Form fields',
      'Skip logic',
      'Interviewer guidance',
    ],
    ownedKeys: ['form', 'introductionPanel', 'label', 'subject'],
  },
];

/**
 * The four interfaces built out of a page of content or a form, each of them
 * now a list of sections and nothing else.
 *
 * Opened through the package's dispatcher over the editor's own registry
 * entry, which is how a host reaches one: what `defineStageEditor` answers
 * with has to be what the registry composes, or an editor that renders
 * perfectly is never reached.
 */
describe('the editors written as section lists', () => {
  it.each(FORM_EDITORS)(
    '$interfaceName renders the sections it lists, in that order',
    async ({ stageId, editor, sections }) => {
      const harness = renderStageEditor({ stageId, registry: editor });

      // Every section registers itself on mount, and the outline is built from
      // what is registered — so an outline that is still short has not
      // finished mounting rather than having lost a section.
      await waitFor(() =>
        expect(harness.outline()).toHaveLength(sections.length),
      );
      expect(harness.outline().map((section) => section.title)).toEqual([
        ...sections,
      ]);
    },
  );

  /**
   * Each editor's own stage out of the shared all-interfaces protocol, opened
   * and saved without a single edit.
   *
   * Two claims, both `roundTrip`'s: the document handed back deep-equals the
   * one the protocol holds, and every key of it is owned by a section that is
   * on screen. `unowned` is empty for all four — these stages are their name,
   * their subject where they have one, and what they ask, and all of it is
   * something the researcher can see and change.
   */
  it.each(FORM_EDITORS)(
    '$interfaceName saves the stage it opened, losing nothing',
    async ({ stageId, editor, ownedKeys }) => {
      const harness = renderStageEditor({ stageId, registry: editor });

      expect(harness.ownedKeys()).toEqual([...ownedKeys]);
      await harness.roundTrip({ unowned: [] });
    },
  );
});
