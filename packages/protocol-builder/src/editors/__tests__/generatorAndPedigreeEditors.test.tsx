import { waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { StageEditorRegistry } from '../../stage-editor-contract.ts';
import type { FixtureStageId } from '../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import { shimMarkdownEditorMeasurement } from '../family-pedigree/__tests__/editorFixtures.ts';
import { familyPedigreeStageEditor } from '../family-pedigree/FamilyPedigreeStageEditor.ts';
import { nameGeneratorStageEditor } from '../name-generator/NameGeneratorStageEditor.ts';

shimMarkdownEditorMeasurement();

type SectionListEditorCase = Readonly<{
  /** Names the case, and is what a failure reports. */
  interfaceName: string;
  stageId: FixtureStageId;
  /** The editor's own registry entry, dispatched through as a host would. */
  editor: Partial<StageEditorRegistry>;
  /** The outline a researcher reads down the side of the stage, in order. */
  sections: readonly string[];
  /** The top-level stage keys those sections have a field for. */
  ownedKeys: readonly string[];
}>;

/**
 * What each of the two editors is written to compose, said here rather than
 * read out of the editor.
 *
 * A table derived from the section list would agree with it whatever it said,
 * including after a section was dropped or two of them swapped. These are the
 * outline entries a researcher reads down the side of the stage, so the
 * expected list is the interface as they meet it — which is also why the
 * pedigree has one more of them than it has sections: its node configuration
 * asks two questions, what a family member IS and what is asked about one, and
 * the outline names both.
 */
const SECTION_LIST_EDITORS: SectionListEditorCase[] = [
  {
    interfaceName: 'NameGenerator',
    stageId: 'name-generator-1',
    editor: nameGeneratorStageEditor,
    sections: [
      'Stage name',
      'Node type',
      'Form fields',
      'Prompt collection',
      'Side panels',
      'Nomination limits',
      'Skip logic',
      'Interviewer guidance',
    ],
    ownedKeys: ['form', 'label', 'prompts', 'subject'],
  },
  {
    interfaceName: 'FamilyPedigree',
    stageId: 'family-pedigree-1',
    editor: familyPedigreeStageEditor,
    sections: [
      'Stage name',
      'Pedigree framing',
      'Pedigree boundaries',
      'Family member data',
      'Family member form',
      'Relationship data',
      'Introduction screen',
      'Family-building prompt',
      'Nomination prompts',
      'Skip logic',
      'Interviewer guidance',
    ],
    ownedKeys: [
      'boundaries',
      'censusPrompt',
      'edgeConfig',
      'framing',
      'label',
      'nodeConfig',
      'nominationPrompts',
    ],
  },
];

/**
 * The two interfaces built out of their own sections rather than out of the
 * shared ones, each of them now a list of sections and nothing else.
 *
 * Opened through the package's dispatcher over the editor's own registry
 * entry, which is how a host reaches one: what `defineStageEditor` answers
 * with has to be what the registry composes, or an editor that renders
 * perfectly is never reached.
 */
describe('the family editors written as section lists', () => {
  it.each(SECTION_LIST_EDITORS)(
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
   * on screen. `unowned` is empty for both — there is nothing either stage
   * holds that the researcher cannot see and change.
   */
  it.each(SECTION_LIST_EDITORS)(
    '$interfaceName saves the stage it opened, losing nothing',
    async ({ stageId, editor, ownedKeys }) => {
      const harness = renderStageEditor({ stageId, registry: editor });

      await waitFor(() => expect(harness.ownedKeys()).toEqual([...ownedKeys]));
      await harness.roundTrip({ unowned: [] });
    },
  );
});
