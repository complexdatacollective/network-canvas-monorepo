import { contentBlocks } from '../../sections/content-blocks/contentBlocks.tsx';
import { interviewerGuidance } from '../../sections/interviewer-guidance/interviewerGuidance.tsx';
import { skipLogic } from '../../sections/skip-logic/skipLogic.tsx';
import { stageHeading } from '../../sections/stage-heading/stageHeading.tsx';
import { defineStageEditor } from '../defineStageEditor.tsx';
import { boundaryOptions } from './sections/boundaryOptions.tsx';
import { censusPrompt } from './sections/censusPrompt.tsx';
import { framingConfig } from './sections/framingConfig.tsx';
import { nominationPrompts } from './sections/nominationPrompts.tsx';
import { pedigreeEdgeConfiguration } from './sections/pedigreeEdgeConfiguration.tsx';
import { pedigreeNodeConfiguration } from './sections/pedigreeNodeConfiguration.tsx';

/**
 * The stage a participant draws their family in.
 *
 * The sections run from what the pedigree IS to what it asks. Framing and
 * boundaries decide the language it uses and how far it has to reach; the node
 * and edge configuration bind the codebook attributes the interface writes the
 * family into; the introduction screen is what the participant reads before
 * any of it; and the census and nomination prompts are the questions asked
 * while they build it.
 *
 * The introduction screen is the shared page of content blocks, so a
 * pedigree's introduction offers the same text, image, audio and video blocks
 * an Information stage does — minus the display size, which only that stage's
 * own schema has room for. It is composed as a page shown BEFORE the task
 * rather than as the stage itself, which is what `variant` says.
 */
export const familyPedigreeStageEditor = defineStageEditor('FamilyPedigree', [
  stageHeading({ documentation: 'family-pedigree' }),
  framingConfig(),
  boundaryOptions(),
  pedigreeNodeConfiguration(),
  pedigreeEdgeConfiguration(),
  contentBlocks({ variant: 'introScreen' }),
  censusPrompt(),
  nominationPrompts(),
  skipLogic(),
  interviewerGuidance(),
]);
