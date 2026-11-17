import type { SuppliedStageSetting } from '../supplied-stage-setting.ts';
import { isStageRecord, type StageRecord } from './configuration.ts';

/** The presets, each a stage's view of the people and their connections. */
const presetsOf = (stage: StageRecord): readonly StageRecord[] => {
  const presets = stage.presets;
  return Array.isArray(presets) ? presets.filter(isStageRecord) : [];
};

/** A preset that highlights attributes shows the attributes heading. */
const anyPresetHighlights = (stage: StageRecord) =>
  presetsOf(stage).some(
    (preset) => Array.isArray(preset.highlight) && preset.highlight.length > 0,
  );

/** A preset that displays connection types shows the links heading. */
const anyPresetShowsEdges = (stage: StageRecord) =>
  presetsOf(stage).some((preset) => {
    const edges = preset.edges;
    return (
      isStageRecord(edges) &&
      Array.isArray(edges.display) &&
      edges.display.length > 0
    );
  });

/** A preset with a group variable shows the groups heading. */
const anyPresetHasGroups = (stage: StageRecord) =>
  presetsOf(stage).some((preset) => preset.groupVariable !== undefined);

/** The Narrative's settings Network Canvas words. */
export const NARRATIVE_SUPPLIED_TEXT: readonly SuppliedStageSetting[] = [
  {
    path: ['attributesHeading'],
    wording: 'interview.stageWording.narrative.attributesHeading',
    when: anyPresetHighlights,
  },
  {
    path: ['linksHeading'],
    wording: 'interview.stageWording.narrative.linksHeading',
    when: anyPresetShowsEdges,
  },
  {
    path: ['groupsHeading'],
    wording: 'interview.stageWording.narrative.groupsHeading',
    when: anyPresetHasGroups,
  },
];
