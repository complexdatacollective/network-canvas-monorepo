import type { SuppliedStageSetting } from '../supplied-stage-setting.ts';
import { hasMaximumNodes, hasMinimumNodes } from './conditions.ts';

/** The Name Generator for Roster Data's settings Network Canvas words. */
export const NAME_GENERATOR_ROSTER_SUPPLIED_TEXT: readonly SuppliedStageSetting[] =
  [
    {
      path: ['panelTitle'],
      wording: 'interview.stageWording.nameGeneratorRoster.panelTitle',
    },
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
    {
      path: ['allAddedNotice'],
      wording: 'interview.stageWording.nameGeneratorRoster.allAddedNotice',
    },
    {
      path: ['unnamedLabel'],
      wording: 'interview.stageWording.nameGeneratorRoster.unnamedLabel',
    },
  ];
