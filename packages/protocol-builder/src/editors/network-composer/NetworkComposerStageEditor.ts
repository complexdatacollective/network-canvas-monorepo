import { background } from '../../sections/background/background.tsx';
import { canvasBehavioursMessages } from '../../sections/canvas-behaviours/canvasBehavioursMessages.ts';
import { nodeLayout } from '../../sections/canvas-behaviours/nodeLayout.tsx';
import { interviewerGuidance } from '../../sections/interviewer-guidance/interviewerGuidance.tsx';
import { skipLogic } from '../../sections/skip-logic/skipLogic.tsx';
import { stageHeading } from '../../sections/stage-heading/stageHeading.tsx';
import { subjectPicker } from '../../sections/subject-picker/subjectPicker.tsx';
import { defineStageEditor } from '../defineStageEditor.tsx';
import { composerConnections } from './sections/composerConnections.tsx';
import { composerNodes } from './sections/composerNodes.tsx';

/**
 * The canvas a participant BUILDS their network on.
 *
 * Every other canvas interface is given a network and asks the participant to
 * do something with it; here they add the people, group them, and draw the
 * connections between them, so there are no prompts at all. What the stage
 * says instead is what those actions are allowed to be — which is why the two
 * sections that describe them come first, and the decisions about the canvas
 * they are performed on come after.
 *
 * No stage filter: the schema gives this interface none, because the network
 * is built here rather than drawn from one built earlier.
 *
 * The layout mode is the shared canvas one with both of its sentences
 * replaced. Manual mode elsewhere leaves every node in a bucket at the foot of
 * the canvas; here a node appears where there is room for it as it is added.
 * And automatic mode elsewhere is how the stage arranges nodes, while here it
 * is only how the stage OPENS: the participant has a switch of their own, and
 * the interview remembers which way they left it
 * (`NetworkComposerStageMetadataSchema`).
 */
export const networkComposerStageEditor = defineStageEditor('NetworkComposer', [
  stageHeading({ documentation: 'network-composer' }),
  subjectPicker({ entity: 'node' }),
  composerNodes(),
  composerConnections(),
  background(),
  nodeLayout({
    manualDescription:
      canvasBehavioursMessages.layoutModeManualComposerDescription,
    automaticDescription:
      canvasBehavioursMessages.layoutModeAutomaticComposerDescription,
  }),
  skipLogic(),
  interviewerGuidance(),
]);
