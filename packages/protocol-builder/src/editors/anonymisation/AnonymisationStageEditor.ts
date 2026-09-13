import { interviewerGuidance } from '../../sections/interviewer-guidance/interviewerGuidance.tsx';
import { skipLogic } from '../../sections/skip-logic/skipLogic.tsx';
import { stageHeading } from '../../sections/stage-heading/stageHeading.tsx';
import { defineStageEditor } from '../defineStageEditor.tsx';
import { encryptedAttributes } from './sections/encryptedAttributes.tsx';
import { passphraseRules } from './sections/passphraseRules.tsx';
import { taskExplanation } from './sections/taskExplanation.tsx';

/**
 * The stage that asks a participant for the passphrase protecting their
 * answers.
 *
 * Three decisions, in the order a researcher makes them: what the participant
 * is told before they choose a passphrase, whether the passphrase has to meet
 * any requirements, and which attributes it protects.
 *
 * The third is not a property of this stage at all — `encrypted` belongs to a
 * codebook attribute and outlives any stage that switches it on — so that
 * section commits its own change under the codebook's lock rather than
 * through this stage's save. It is composed here because this is where a
 * researcher goes looking for it.
 *
 * Skip logic is included deliberately. This was once the one interface without
 * it, which made an overwriting save silently delete skip logic a protocol
 * already held; a stage that never runs is as legitimate here as anywhere
 * else.
 */
export const anonymisationStageEditor = defineStageEditor('Anonymisation', [
  stageHeading({ documentation: 'anonymisation' }),
  taskExplanation(),
  passphraseRules(),
  encryptedAttributes(),
  skipLogic(),
  interviewerGuidance(),
]);
