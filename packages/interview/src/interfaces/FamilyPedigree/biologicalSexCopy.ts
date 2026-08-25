/**
 * Participant-facing copy for the biological-sex question.
 *
 * The values and their labels are schema contract and live in
 * `@codaco/protocol-validation` (`BIOLOGICAL_SEX_OPTIONS`). The wording below
 * is interview copy: it is only ever rendered, never persisted, so it belongs
 * beside the screens that ask the question.
 */

/**
 * Framing-invariant (the mother/father vs egg/sperm framing never changes
 * *this* question); only the grammatical subject differs — the participant
 * themselves, or a relative.
 */
export const BIOLOGICAL_SEX_QUESTION = {
  self: 'What sex were you recorded as at birth?',
  other: 'What sex was this person recorded as at birth?',
} as const;

export const BIOLOGICAL_SEX_HINT =
  'If you’re not sure, choose “Don’t know” — please don’t guess.';

/**
 * One-time explanation shown before the sex question is first asked, so the
 * participant understands it is about inheritance, not gender identity.
 */
export const BIOLOGICAL_SEX_LEAD_IN =
  'To understand how conditions can be passed down a family, we need the sex each person was recorded as at birth — not how they describe their gender.';
