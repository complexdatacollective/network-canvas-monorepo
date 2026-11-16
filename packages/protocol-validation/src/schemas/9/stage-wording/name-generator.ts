import type { SuppliedStageSetting } from '../supplied-stage-setting.ts';
import { hasMaximumNodes, hasMinimumNodes } from './conditions.ts';

/** The settings every name generator's limits and panels share. */
export const NAME_GENERATOR_SUPPLIED_TEXT: readonly SuppliedStageSetting[] = [
  {
    path: ['minNodesNotice'],
    wording: 'interview.stageWording.nameGenerator.minNodesNotice',
    when: hasMinimumNodes,
  },
  {
    path: ['maxNodesNotice'],
    wording: 'interview.stageWording.nameGenerator.maxNodesNotice',
    when: hasMaximumNodes,
  },
];
