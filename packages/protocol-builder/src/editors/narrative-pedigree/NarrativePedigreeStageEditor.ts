import { interviewerGuidance } from '../../sections/interviewer-guidance/interviewerGuidance.tsx';
import { skipLogic } from '../../sections/skip-logic/skipLogic.tsx';
import { stageHeading } from '../../sections/stage-heading/stageHeading.tsx';
import { defineStageEditor } from '../defineStageEditor.tsx';
import { atRiskStatuses } from './sections/atRiskStatuses.tsx';
import { diseases } from './sections/diseases.tsx';
import { sourcePedigree } from './sections/sourcePedigree.tsx';

/**
 * The stage that draws conditions onto a family the participant has already
 * built.
 *
 * It has no family of its own, and so no subject to pick: every disease maps
 * an attribute of the node type belonging to the Family Pedigree stage it
 * reads, and the protocol schema resolves this stage's subject through that
 * stage. So the source comes first, and everything after it is configured
 * against that pedigree's codebook — which is also why choosing a different
 * one throws the disease mappings away.
 *
 * A source that is deleted, moved later, or changed to another interface while
 * this editor is open is reported rather than corrected: which pedigree this
 * stage shows is the researcher's decision, not a gap to fill in for them.
 *
 * At-risk statuses come last because they are a decision about how what has
 * already been mapped is DRAWN, and they read as an argument rather than as a
 * setting — the section is mostly the explanation of why it is off.
 */
export const narrativePedigreeStageEditor = defineStageEditor(
  'NarrativePedigree',
  [
    stageHeading({ documentation: 'narrative-pedigree' }),
    sourcePedigree(),
    diseases(),
    atRiskStatuses(),
    skipLogic(),
    interviewerGuidance(),
  ],
);
