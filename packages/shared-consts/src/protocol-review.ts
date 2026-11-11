import { z } from 'zod';

/**
 * The study details a researcher gives the automated protocol review
 * (Architect's "Automated Protocol Review" experiment).
 *
 * Defined once, here, because two programs must agree on it: the wizard in
 * Architect that collects it, and the review service that receives it
 * (`workers/protocol-review`).
 *
 * It is NOT part of the protocol schema. Architect keeps the details inside
 * the protocol's `experiments.protocolReview`, whose contents the schema
 * leaves open so that this shape can change without a schema version; what
 * is stored there is read back through Architect's own tolerant parser
 * (`apps/architect/src/protocolReview/settings.ts`), never trusted to match.
 */

/** The longest each piece of text may be, in characters. */
export const STUDY_CONTEXT_LIMITS = {
  researchQuestion: 350,
  population: 600,
  synopsis: 3000,
} as const;

/**
 * How the interview is run: with an interviewer beside the participant, or by
 * the participant alone.
 */
export const STUDY_ADMINISTRATION_MODES = [
  'face_to_face',
  'self_administered',
] as const;

export type StudyAdministrationMode =
  (typeof STUDY_ADMINISTRATION_MODES)[number];

const holdsText = (value: string) => /\S/u.test(value);

export const StudyContextSchema = z.strictObject({
  /** At least one; there is no upper limit on how many. */
  researchQuestions: z
    .array(
      z
        .string()
        .max(STUDY_CONTEXT_LIMITS.researchQuestion)
        .refine(holdsText, 'A research question cannot be blank.'),
    )
    .min(1),
  population: z
    .string()
    .max(STUDY_CONTEXT_LIMITS.population)
    .refine(holdsText, 'The population cannot be blank.'),
  administration: z.enum(STUDY_ADMINISTRATION_MODES),
  synopsis: z.string().max(STUDY_CONTEXT_LIMITS.synopsis).optional(),
});

export type StudyContext = z.infer<typeof StudyContextSchema>;
