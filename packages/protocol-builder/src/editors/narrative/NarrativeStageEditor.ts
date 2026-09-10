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
 * Both layout-mode sentences are this interface's own. The shared ones
 * describe the stages that COLLECT positions, where every node starts in a
 * bucket at the foot of the canvas waiting to be placed and automatic mode
 * draws all of them in; a narrative stage places nothing, shows each node at
 * the position its preset's attribute already holds, and leaves out the ones
 * it holds no position for in EITHER mode — the simulation is given the same
 * nodes manual mode shows. The shared automatic sentence also promises
 * repositioning outright, which here is the "Allow moving nodes" switch's to
 * grant.
 */
export const narrativeStageEditor = defineStageEditor('Narrative', [
  stageHeading({ documentation: 'narrative' }),
  subjectPicker({ entity: 'node', filter: true }),
  narrativePresets(),
  background(),
  nodeLayout({
    manualDescription:
      canvasBehavioursMessages.layoutModeManualNarrativeDescription,
    automaticDescription:
      canvasBehavioursMessages.layoutModeAutomaticNarrativeDescription,
  }),
  canvasPermissions(),
  skipLogic(),
  interviewerGuidance(),
]);
