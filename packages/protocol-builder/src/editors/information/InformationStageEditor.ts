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
 * Skip logic is composed even so: the schema allows it on every stage and the
 * interview runtime honours it generically, so a researcher who wants a page
 * shown to only some participants needs a way to say so.
 */
export const informationStageEditor = defineStageEditor('Information', [
  stageHeading({ documentation: 'information' }),
  contentBlocks(),
  skipLogic(),
  interviewerGuidance(),
]);
