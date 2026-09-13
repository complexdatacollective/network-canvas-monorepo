import { background } from '../../sections/background/background.tsx';
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
 * Automatic layout is not a section of its own here. It is one of the
 * decisions about the nodes the participant adds — how the canvas arranges
 * them as the stage opens — so it sits inside the node configuration beside
 * the attributes those nodes carry, which is where Architect put it.
 */
export const networkComposerStageEditor = defineStageEditor('NetworkComposer', [
  stageHeading({ documentation: 'network-composer' }),
  subjectPicker({ entity: 'node' }),
  composerNodes(),
  composerConnections(),
  background(),
  skipLogic(),
  interviewerGuidance(),
]);
