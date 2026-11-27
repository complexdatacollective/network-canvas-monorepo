import { background } from '../../sections/background/background.tsx';
import { nodeLayout } from '../../sections/canvas-behaviours/nodeLayout.tsx';
import { interviewerGuidance } from '../../sections/interviewer-guidance/interviewerGuidance.tsx';
import { skipLogic } from '../../sections/skip-logic/skipLogic.tsx';
import { subjectPicker } from '../../sections/subject-picker/subjectPicker.tsx';
import { defineStageEditor } from '../defineStageEditor.tsx';
import { sociogramPrompts } from './sections/prompts/sociogramPrompts.tsx';
import { sociogramLayout } from './sections/SociogramLayoutSection.tsx';

/**
 * The canvas a participant arranges their network on.
 *
 * A sociogram sets a series of tasks — place these people, connect the ones
 * who know each other, mark the ones you are closest to — all in the one
 * layout the stage names, so the prompts are the substance of the stage and come before the decisions about the canvas
 * they are performed on: what is drawn behind the nodes, and how the nodes are
 * arranged when the stage opens.
 *
 * `behaviours.automaticLayout` is the only behaviour a sociogram has. Whether
 * nodes can be moved follows from each prompt's task: only a positioning task
 * lets the participant place and move them.
 */
export const sociogramStageEditor = defineStageEditor('Sociogram', [
  subjectPicker({ entity: 'node', filter: true }),
  sociogramLayout(),
  sociogramPrompts(),
  background(),
  nodeLayout(),
  skipLogic(),
  interviewerGuidance(),
]);
