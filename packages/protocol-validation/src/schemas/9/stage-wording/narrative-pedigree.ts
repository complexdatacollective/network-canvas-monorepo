import type { SuppliedStageSetting } from '../supplied-stage-setting.ts';
import type { StageRecord } from './configuration.ts';

/** The at-risk rows of the key are drawn only when the stage shows them. */
export const showsAtRiskStatuses = (stage: StageRecord) =>
  stage.showAtRiskStatuses === true;

/**
 * The Narrative Pedigree's settings Network Canvas words. Its key and the
 * clear focus tooltip, which every Narrative Pedigree shows alike, are
 * interface text (`interface-text-entries.ts`).
 */
export const NARRATIVE_PEDIGREE_SUPPLIED_TEXT: readonly SuppliedStageSetting[] =
  [
    {
      path: ['saveSnapshot'],
      wording: 'interview.stageWording.narrativePedigree.saveSnapshot',
    },
    {
      path: ['conditionText', 'selectCondition'],
      wording:
        'interview.stageWording.narrativePedigree.conditionText.selectCondition',
    },
    {
      path: ['conditionText', 'snapshotCondition'],
      wording:
        'interview.stageWording.narrativePedigree.conditionText.snapshotCondition',
    },
    {
      path: ['conditionText', 'snapshotInheritance'],
      wording:
        'interview.stageWording.narrativePedigree.conditionText.snapshotInheritance',
    },
  ];
