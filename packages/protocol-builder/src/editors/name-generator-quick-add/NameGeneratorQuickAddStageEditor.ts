import { alterLimits } from '../../sections/alter-limits/alterLimits.tsx';
import { interviewerGuidance } from '../../sections/interviewer-guidance/interviewerGuidance.tsx';
import { nameGeneratorPrompts } from '../../sections/name-generator-prompts/nameGeneratorPrompts.tsx';
import { nodePanels } from '../../sections/panels/nodePanels.tsx';
import { useAutoNameFromPanels } from '../../sections/panels/useAutoNameFromPanels.ts';
import { skipLogic } from '../../sections/skip-logic/skipLogic.tsx';
import { stageHeading } from '../../sections/stage-heading/stageHeading.tsx';
import { subjectPicker } from '../../sections/subject-picker/subjectPicker.tsx';
import { defineStageEditor } from '../defineStageEditor.tsx';
import { quickAddAttribute } from './sections/quickAddAttribute.tsx';

/**
 * The name generator a participant names people with, one box at a time.
 *
 * The same five decisions as the form-based generator, with the form replaced
 * by a single attribute: the participant types one thing and a person exists.
 * That attribute comes before the prompts for the reason the form does — it
 * describes the people the prompts ask for, and a prompt's own attribute
 * stamps are chosen from what quick add does NOT already fill in.
 *
 * The heading is qualified by the side panels, exactly as the form-based
 * generator's is: a generator offering the people named so far is a different
 * stage from one that offers nothing, and the name proposed to a new stage
 * says so.
 */
export const nameGeneratorQuickAddStageEditor = defineStageEditor(
  'NameGeneratorQuickAdd',
  [
    stageHeading({
      documentation: 'name-generator-using-quick-add',
      autoName: useAutoNameFromPanels,
    }),
    subjectPicker({ entity: 'node' }),
    quickAddAttribute(),
    nameGeneratorPrompts(),
    nodePanels(),
    alterLimits(),
    skipLogic(),
    interviewerGuidance(),
  ],
);
