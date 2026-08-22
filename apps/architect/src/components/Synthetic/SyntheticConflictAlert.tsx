import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import type { ConstraintConflict } from '@codaco/protocol-utilities';

/**
 * One structured refusal from the feasibility gate, rendered as the engine
 * wrote it.
 *
 * The `reason` is reproduced verbatim (spec governing rule 3: the UI never
 * paraphrases a refusal) — it is the same sentence a generation run would throw
 * with, so a researcher who reads it here and then hits it in Interviewer or
 * Fresco meets one explanation rather than two. Everything around it is
 * addressing: which type and attributes the refusal is about, and which rules
 * it names.
 */

const EGO_SUBJECT_LABEL = 'Ego';
const UNNAMED_SUBJECT_LABEL = 'This type';

export type SyntheticConflictAlertProps = {
  conflict: ConstraintConflict;
};

export function SyntheticConflictAlert({
  conflict,
}: SyntheticConflictAlertProps) {
  const subject =
    conflict.entity === 'ego'
      ? EGO_SUBJECT_LABEL
      : (conflict.entityTypeName ??
        conflict.entityType ??
        UNNAMED_SUBJECT_LABEL);
  // A roster or pair refusal names no attribute at all, so the type alone is
  // the title; joining an empty list would leave a dangling separator.
  const title =
    conflict.variableNames.length === 0
      ? subject
      : `${subject}: ${conflict.variableNames.join(', ')}`;

  return (
    <Alert variant="destructive" density="compact" className="my-0">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{conflict.reason}</AlertDescription>
    </Alert>
  );
}

/** A stable key for a conflict, which carries no id of its own. */
export const conflictKey = (
  conflict: ConstraintConflict,
  index: number,
): string =>
  `${conflict.entity}-${conflict.entityType ?? ''}-${conflict.variableIds.join(',')}-${index}`;

export type SyntheticConflictListProps = {
  conflicts: readonly ConstraintConflict[];
};

/** Every conflict in a batch, one titled alert per refusal. */
export function SyntheticConflictList({
  conflicts,
}: SyntheticConflictListProps) {
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {conflicts.map((conflict, index) => (
        <li key={conflictKey(conflict, index)}>
          <SyntheticConflictAlert conflict={conflict} />
        </li>
      ))}
    </ul>
  );
}
