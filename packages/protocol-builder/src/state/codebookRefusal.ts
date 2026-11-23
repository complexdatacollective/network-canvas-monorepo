/**
 * Why a codebook save did not happen, in the terms the contract answers in.
 *
 * `held` covers all three ways a lock stands in the way — the acquire came
 * back read-only, the submit was refused because the lock had gone, a refactor
 * could not take every section it writes — because a researcher is told who is
 * editing rather than which of the three it was. A section id is an internal
 * address and is never shown, so unnamed holders are all that is left to say.
 *
 * `sectionGone` and `subjectGone` are one fact seen from two surfaces: the
 * type a codebook editor is open on has been deleted, and the type a STAGE
 * collects into has. What to do about it differs — there is no codebook editor
 * to close on a stage row — so each says its own sentence.
 */
export type CodebookRefusal =
  | Readonly<{ kind: 'held'; holders?: readonly string[] }>
  /** Something the host cannot rewrite still names what was to be deleted. */
  | Readonly<{ kind: 'referencesRemain'; references: number }>
  | Readonly<{ kind: 'invalidShape' }>
  /**
   * The host would not take the files imported while the editor was open.
   * `resourceId` names the file it stopped at, when the host said which.
   */
  | Readonly<{ kind: 'promotionFailed'; resourceId?: string }>
  | Readonly<{ kind: 'sectionGone' }>
  /** A collaborator created the section this change would have created. */
  | Readonly<{ kind: 'sectionCreatedElsewhere' }>
  | Readonly<{ kind: 'subjectGone' }>
  | Readonly<{ kind: 'protocolGone' }>
  | Readonly<{ kind: 'unreachable' }>
  | Readonly<{ kind: 'unexplained' }>;
