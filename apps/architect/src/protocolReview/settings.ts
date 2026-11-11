import { z } from 'zod';

import type { Experiments } from '@codaco/protocol-validation';
import {
  STUDY_ADMINISTRATION_MODES,
  STUDY_CONTEXT_LIMITS,
  type StudyAdministrationMode,
  type StudyContext,
  StudyContextSchema,
} from '@codaco/shared-consts';

/**
 * What Architect keeps inside `experiments.protocolReview`.
 *
 * The protocol schema does not define this object (see protocol-validation's
 * `ExperimentsSchema`): its contents belong to this app and may change between
 * versions without a schema change. Everything here therefore reads stored
 * data defensively — a field of an unexpected shape is replaced by its empty
 * default, and nothing throws.
 */

/** The study details as the wizard holds them: possibly unfinished. */
export type StudyDetailsDraft = {
  researchQuestions: string[];
  population: string;
  administration: StudyAdministrationMode | null;
  synopsis: string;
};

export type ProtocolReviewSettings = {
  studyDetails: StudyDetailsDraft;
};

/** The key the study details are stored under, inside `protocolReview`. */
const STUDY_CONTEXT_KEY = 'studyContext';

const emptyDraft = (): StudyDetailsDraft => ({
  researchQuestions: [],
  population: '',
  administration: null,
  synopsis: '',
});

// Each field is read on its own: one that does not fit falls back to its
// empty default and does not disturb the others.
const StudyDetailsDraftSchema = z.object({
  researchQuestions: z
    .array(z.string().max(STUDY_CONTEXT_LIMITS.researchQuestion))
    .catch(() => []),
  population: z.string().max(STUDY_CONTEXT_LIMITS.population).catch(''),
  administration: z.enum(STUDY_ADMINISTRATION_MODES).nullable().catch(null),
  synopsis: z.string().max(STUDY_CONTEXT_LIMITS.synopsis).catch(''),
});

const StoredSettingsSchema = z
  .object({
    [STUDY_CONTEXT_KEY]: StudyDetailsDraftSchema.catch(emptyDraft),
  })
  .catch(() => ({ [STUDY_CONTEXT_KEY]: emptyDraft() }));

/** Reads whatever is stored under `protocolReview`. Never throws or fails. */
export const parseProtocolReviewSettings = (
  raw: unknown,
): ProtocolReviewSettings => ({
  studyDetails: StoredSettingsSchema.parse(raw)[STUDY_CONTEXT_KEY],
});

/**
 * The study details as the review service requires them, or `undefined` while
 * the draft is incomplete or invalid. A blank synopsis is left out.
 */
export const completeStudyContext = (
  draft: StudyDetailsDraft,
): StudyContext | undefined => {
  const result = StudyContextSchema.safeParse({
    researchQuestions: draft.researchQuestions,
    population: draft.population,
    administration: draft.administration,
    ...(/\S/u.test(draft.synopsis) && { synopsis: draft.synopsis }),
  });
  return result.success ? result.data : undefined;
};

/** What is written under `protocolReview` for these study details. */
export const serializeProtocolReviewSettings = (
  studyContext: StudyContext,
): NonNullable<Experiments['protocolReview']> => ({
  [STUDY_CONTEXT_KEY]: {
    researchQuestions: [...studyContext.researchQuestions],
    population: studyContext.population,
    administration: studyContext.administration,
    ...(studyContext.synopsis !== undefined && {
      synopsis: studyContext.synopsis,
    }),
  },
});
