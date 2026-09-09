import { contentBlocks } from '../../sections/content-blocks/contentBlocks.tsx';
import { interviewerGuidance } from '../../sections/interviewer-guidance/interviewerGuidance.tsx';
import { skipLogic } from '../../sections/skip-logic/skipLogic.tsx';
import { stageHeading } from '../../sections/stage-heading/stageHeading.tsx';
import { defineStageEditor } from '../defineStageEditor.tsx';

/**
 * A page the participant reads, rather than a task they do.
 *
 * The whole interface is its page: a heading and an ordered list of blocks of
 * text and media. There is no subject — nothing here is about a person or a
 * relationship — and nothing to configure about how the participant answers,
 * because they are not being asked anything.
 *
 * Skip logic is composed even so. The schema allows it on every stage and the
 * interview runtime honours it generically, so a researcher who wants a page
 * shown to only some participants has to be able to say so — and a section
 * left out would not merely hide the setting, it would let a save delete skip
 * logic somebody had already authored.
 */
export const informationStageEditor = defineStageEditor('Information', [
  stageHeading({ documentation: 'information' }),
  contentBlocks(),
  skipLogic(),
  interviewerGuidance(),
]);
