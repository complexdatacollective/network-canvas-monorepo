import { background } from '../../sections/background/background.tsx';
import { canvasBehavioursMessages } from '../../sections/canvas-behaviours/canvasBehavioursMessages.ts';
import { nodeLayout } from '../../sections/canvas-behaviours/nodeLayout.tsx';
import { interviewerGuidance } from '../../sections/interviewer-guidance/interviewerGuidance.tsx';
import { skipLogic } from '../../sections/skip-logic/skipLogic.tsx';
import { stageHeading } from '../../sections/stage-heading/stageHeading.tsx';
import { subjectPicker } from '../../sections/subject-picker/subjectPicker.tsx';
import { defineStageEditor } from '../defineStageEditor.tsx';
import { canvasPermissions } from './sections/permissions/canvasPermissions.tsx';
import { narrativePresets } from './sections/presets/narrativePresets.tsx';

/**
 * The canvas a participant is shown their own network on and asked to talk
 * about it.
 *
 * A narrative stage collects nothing: the network is already built, and the
 * researcher moves between saved pictures of it while the participant tells
 * its story. So the sections read in the order the decisions are made — which
 * people are on the canvas, the pictures that can be switched between, what
 * sits behind them, how they are arranged when the stage opens, and what the
 * participant may do to any of it.
 *
 * The manual-mode sentence is this interface's own. The shared one describes
 * the stages that COLLECT positions, where every node starts in a bucket at
 * the foot of the canvas waiting to be placed; a narrative stage places
 * nothing and shows each node at the position its preset's attribute already
 * holds, leaving out the ones it holds no position for.
 */
export const narrativeStageEditor = defineStageEditor('Narrative', [
  stageHeading({ documentation: 'narrative' }),
  subjectPicker({ entity: 'node', filter: true }),
  narrativePresets(),
  background(),
  nodeLayout({
    manualDescription:
      canvasBehavioursMessages.layoutModeManualNarrativeDescription,
  }),
  canvasPermissions(),
  skipLogic(),
  interviewerGuidance(),
]);
