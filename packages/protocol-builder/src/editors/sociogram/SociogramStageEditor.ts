import { background } from '../../sections/background/background.tsx';
import { nodeLayout } from '../../sections/canvas-behaviours/nodeLayout.tsx';
import { interviewerGuidance } from '../../sections/interviewer-guidance/interviewerGuidance.tsx';
import { skipLogic } from '../../sections/skip-logic/skipLogic.tsx';
import { stageHeading } from '../../sections/stage-heading/stageHeading.tsx';
import { subjectPicker } from '../../sections/subject-picker/subjectPicker.tsx';
import { defineStageEditor } from '../defineStageEditor.tsx';
import { sociogramPrompts } from './sections/prompts/sociogramPrompts.tsx';

/**
 * The canvas a participant arranges their network on.
 *
 * A sociogram sets a series of tasks — place these people, connect the ones
 * who know each other, mark the ones you are closest to — so the prompts are
 * the substance of the stage and come before the decisions about the canvas
 * they are performed on: what is drawn behind the nodes, and how the nodes are
 * arranged when the stage opens.
 *
 * `behaviours.automaticLayout` is the only member of the shared canvas
 * behaviours this interface offers, and the other two are deliberately left
 * out. `freeDraw` and `allowRepositioning` are EXPRESSIBLE on a sociogram
 * because the schema shares that object with the narrative interface, and the
 * interview honours neither: `Sociogram.tsx` reads no drawing flag, and
 * repositioning is unconditionally on there by a recorded decision (#673,
 * decision #12). A switch promising a behaviour the participant will never get
 * is worse than no switch. A stage somebody else authored carrying one of them
 * keeps it: an unrendered key is not a key this editor may throw away.
 */
export const sociogramStageEditor = defineStageEditor('Sociogram', [
  stageHeading({ documentation: 'sociogram' }),
  subjectPicker({ entity: 'node', filter: true }),
  sociogramPrompts(),
  background(),
  nodeLayout(),
  skipLogic(),
  interviewerGuidance(),
]);
