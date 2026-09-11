import { waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { StageEditorRegistry } from '../../stage-editor-contract.ts';
import type { FixtureStageId } from '../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import { anonymisationStageEditor } from '../anonymisation/AnonymisationStageEditor.ts';
import { shimMarkdownEditorMeasurement } from '../family-pedigree/__tests__/editorFixtures.ts';
import { geospatialStageEditor } from '../geospatial/GeospatialStageEditor.ts';
import { narrativePedigreeStageEditor } from '../narrative-pedigree/NarrativePedigreeStageEditor.ts';
import { narrativeStageEditor } from '../narrative/NarrativeStageEditor.ts';
import { networkComposerStageEditor } from '../network-composer/NetworkComposerStageEditor.ts';
import { sociogramStageEditor } from '../sociogram/SociogramStageEditor.ts';

shimMarkdownEditorMeasurement();

type CanvasEditorCase = Readonly<{
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
 * What each canvas editor is written to compose, said here rather than read
 * out of the editor.
 *
 * A table derived from the section list would agree with it whatever it said,
 * including after a section was dropped or two of them swapped. These are the
 * outline entries a researcher reads down the side of the stage, so the
 * expected list is the interface as they meet it — which is why the subject
 * picker contributes two of them: choosing a node type and filtering the
 * network are separate decisions with separate switches.
 */
const CANVAS_EDITORS: CanvasEditorCase[] = [
  {
    interfaceName: 'Sociogram',
    stageId: 'sociogram-1',
    editor: sociogramStageEditor,
    sections: [
      'Stage name',
      'Node type',
      'Stage filter',
      'Prompts',
      'Background',
      'Node layout',
      'Skip logic',
      'Interviewer guidance',
    ],
    ownedKeys: ['background', 'behaviours', 'label', 'prompts', 'subject'],
  },
  {
    interfaceName: 'Narrative',
    stageId: 'narrative-1',
    editor: narrativeStageEditor,
    sections: [
      'Stage name',
      'Node type',
      'Stage filter',
      'Visualization presets',
      'Background',
      'Node layout',
      'Narrative behaviors',
      'Skip logic',
      'Interviewer guidance',
    ],
    ownedKeys: ['background', 'behaviours', 'label', 'presets', 'subject'],
  },
  {
    interfaceName: 'NetworkComposer',
    stageId: 'network-composer-1',
    editor: networkComposerStageEditor,
    sections: [
      'Stage name',
      'Node type',
      'Node configuration',
      'Editable attributes',
      'Edge configuration',
      'Background',
      'Node layout',
      'Skip logic',
      'Interviewer guidance',
    ],
    ownedKeys: [
      'background',
      'behaviours',
      'convexHullVariable',
      'edges',
      'label',
      'layoutVariable',
      'quickAdd',
      'subject',
    ],
  },
  {
    interfaceName: 'Geospatial',
    stageId: 'geospatial-1',
    editor: geospatialStageEditor,
    // The map is four decisions a researcher makes at different times, each
    // finishable on its own — and the prompts sit between the two halves,
    // because what the map IS has to be settled before there is anything to
    // ask about it, and how it looks and where it opens are settled once the
    // questions are written.
    sections: [
      'Stage name',
      'Node type',
      'Stage filter',
      'Map access',
      'Map layers',
      'Prompts',
      'Map appearance',
      'Map starting position',
      'Skip logic',
      'Interviewer guidance',
    ],
    ownedKeys: ['label', 'mapOptions', 'prompts', 'subject'],
  },
  {
    interfaceName: 'NarrativePedigree',
    stageId: 'narrative-pedigree-1',
    editor: narrativePedigreeStageEditor,
    // No subject picker: this stage draws a family somebody else collected, so
    // the node type its diseases are attributes of is the source pedigree's,
    // resolved through the stage it names rather than chosen here.
    sections: [
      'Stage name',
      'Pedigree source',
      'Disease mappings',
      'At-risk statuses',
      'Skip logic',
      'Interviewer guidance',
    ],
    ownedKeys: ['diseases', 'label', 'showAtRiskStatuses', 'sourceStageId'],
  },
  {
    interfaceName: 'Anonymisation',
    stageId: 'anonymisation-1',
    editor: anonymisationStageEditor,
    // Encrypted attributes are here, and own no stage key: `encrypted` belongs
    // to a codebook attribute, so that section writes the codebook under its
    // own lock rather than through this stage's save.
    sections: [
      'Stage name',
      'Task explanation',
      'Passphrase validation',
      'Encrypted attributes',
      'Skip logic',
      'Interviewer guidance',
    ],
    ownedKeys: ['explanationText', 'label', 'validation'],
  },
];

/**
 * The interfaces built on a canvas, each of them a list of sections and
 * nothing else.
 *
 * Opened through the package's dispatcher over the editor's own registry
 * entry, which is how a host reaches one: what `defineStageEditor` answers
 * with has to be what the registry composes, or an editor that renders
 * perfectly is never reached.
 */
describe('the canvas editors written as section lists', () => {
  it.each(CANVAS_EDITORS)(
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
   * on screen. `unowned` is empty — there is nothing these stages hold that
   * the researcher cannot see and change.
   */
  it.each(CANVAS_EDITORS)(
    '$interfaceName saves the stage it opened, losing nothing',
    async ({ stageId, editor, ownedKeys }) => {
      const harness = renderStageEditor({ stageId, registry: editor });

      await waitFor(() => expect(harness.ownedKeys()).toEqual([...ownedKeys]));
      await harness.roundTrip({ unowned: [] });
    },
  );
});
