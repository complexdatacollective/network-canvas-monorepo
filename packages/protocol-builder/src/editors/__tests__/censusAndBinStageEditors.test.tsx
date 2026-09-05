import { waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { StageType } from '@codaco/protocol-validation';

import {
  missingStageEditors,
  STAGE_TYPES,
} from '../../stage-editor-contract.ts';
import { composeStageEditorRegistry } from '../../stageEditorRegistry.ts';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import { censusAndBinStageEditors } from '../censusAndBinStageEditors.ts';

/**
 * One fixture stage per interface the family claims, and the sections the
 * editor for it mounts.
 *
 * The dispatcher is what is under test here rather than any one editor: the
 * outline is read to prove that opening a stage of each type reached the
 * editor built for it, and not merely SOME editor.
 */
const FAMILY: readonly Readonly<{
  stageType: StageType;
  stageId: string;
  outline: readonly string[];
}>[] = [
  {
    stageType: 'CategoricalBin',
    stageId: 'categorical-bin-1',
    outline: [
      'Stage name',
      'Node type',
      'Stage filter',
      'Prompts',
      'Skip logic',
      'Interviewer guidance',
    ],
  },
  {
    stageType: 'OrdinalBin',
    stageId: 'ordinal-bin-1',
    outline: [
      'Stage name',
      'Node type',
      'Stage filter',
      'Prompts',
      'Skip logic',
      'Interviewer guidance',
    ],
  },
  {
    stageType: 'DyadCensus',
    stageId: 'dyad-census-1',
    outline: [
      'Stage name',
      'Node type',
      'Stage filter',
      'Task introduction',
      'Prompts',
      'Skip logic',
      'Interviewer guidance',
    ],
  },
  {
    stageType: 'OneToManyDyadCensus',
    stageId: 'one-to-many-dyad-census-1',
    outline: [
      'Stage name',
      'Node type',
      'Stage filter',
      'Prompts',
      'Node availability',
      'Skip logic',
      'Interviewer guidance',
    ],
  },
  {
    stageType: 'TieStrengthCensus',
    stageId: 'tie-strength-census-1',
    outline: [
      'Stage name',
      'Node type',
      'Stage filter',
      'Task introduction',
      'Prompts',
      'Skip logic',
      'Interviewer guidance',
    ],
  },
];

describe('the census and bin editor family', () => {
  it('claims exactly the five interfaces it is built for', () => {
    expect(Object.keys(censusAndBinStageEditors).toSorted()).toEqual(
      FAMILY.map(({ stageType }) => stageType).toSorted(),
    );
  });

  /**
   * Both directions at once: the five it claims are no longer waiting, and
   * every other interface in the schema still is. A part that claimed one
   * interface too many would pass a "none of these are missing" assertion.
   */
  it('leaves exactly the rest of the schema waiting for an editor', () => {
    const claimed = FAMILY.map(({ stageType }) => stageType);

    expect(
      missingStageEditors(
        composeStageEditorRegistry(censusAndBinStageEditors),
      ).toSorted(),
    ).toEqual(
      STAGE_TYPES.filter(
        (stageType) => !claimed.includes(stageType),
      ).toSorted(),
    );
  });

  it.each(FAMILY)(
    'opens a $stageType stage in the editor built for it',
    async ({ stageId, outline }) => {
      const harness = renderStageEditor({
        stageId,
        registry: censusAndBinStageEditors,
      });

      await waitFor(() =>
        expect(harness.outline()).toHaveLength(outline.length),
      );
      expect(harness.outline().map((section) => section.title)).toEqual([
        ...outline,
      ]);
    },
  );

  /**
   * The same five stages with no registry named at all, which is how a host
   * that has not composed one of its own reaches an editor.
   *
   * The test above proves the part maps each interface to the right editor;
   * this proves the part is WIRED IN — that `REGISTRY_PARTS` lists it and
   * `AWAITING_STAGE_EDITORS` no longer does. Without it the family could be
   * complete and correct and still leave every one of these stages throwing
   * `UnregisteredStageTypeError` in every host.
   */
  it.each(FAMILY)(
    'reaches that editor for a $stageType stage through the package’s own registry',
    async ({ stageId, outline }) => {
      const harness = renderStageEditor({ stageId });

      await waitFor(() =>
        expect(harness.outline()).toHaveLength(outline.length),
      );
      expect(harness.outline().map((section) => section.title)).toEqual([
        ...outline,
      ]);
    },
  );
});
