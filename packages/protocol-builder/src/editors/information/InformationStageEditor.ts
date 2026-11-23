import { interviewerGuidance } from '../../sections/interviewer-guidance/interviewerGuidance.tsx';
import { pageContent } from '../../sections/page-content/pageContent.tsx';
import { skipLogic } from '../../sections/skip-logic/skipLogic.tsx';
import { defineStageEditor } from '../defineStageEditor.tsx';

/**
 * A page the participant reads, rather than a task they do.
 *
 * The whole interface is its page: one text, holding its heading, its words
 * and its media in the order they are read. There is no subject — nothing here is about a person or a
 * relationship — and nothing to configure about how the participant answers,
 * because they are not being asked anything.
 *
 * Skip logic is composed even so: the schema allows it on every stage and the
 * interview runtime honours it generically, so a researcher who wants a page
 * shown to only some participants needs a way to say so.
 */
export const informationStageEditor = defineStageEditor('Information', [
  pageContent(),
  skipLogic(),
  interviewerGuidance(),
]);
