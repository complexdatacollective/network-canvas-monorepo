import type { ConstraintConflict } from '@codaco/protocol-utilities';
import type { SyntheticConstraintRefusal } from '~/lib/synthetic/constraintError';

// Mirrors the bullet wording `SyntheticDataConstraintError` composes into its
// flat, newline-joined message (see
// packages/protocol-utilities/src/synthetic-interviews/constraints/error.ts),
// but renders each conflict as its own list item so the toast stays readable
// without depending on whitespace being preserved.
function ConstraintConflictItem({
  conflict,
}: {
  conflict: ConstraintConflict;
}) {
  const subject =
    conflict.entity === 'ego'
      ? 'ego'
      : `${conflict.entity} "${conflict.entityTypeName ?? conflict.entityType}"`;
  const variables = conflict.variableNames
    .map((name) => `"${name}"`)
    .join(' and ');
  return (
    <li>
      {subject}, {variables} ({conflict.rules.join(', ')}): {conflict.reason}
    </li>
  );
}

/**
 * The body of the "Generation failed" toast.
 *
 * A protocol can declare arbitrarily many clashing rules. fresco-ui's `Toast`
 * bounds and scrolls its description internally, so however many conflicts a
 * protocol produces, the toast's own title and Close control stay on screen
 * without this component needing its own scroll handling.
 */
export function GenerationFailureDescription({
  error,
}: {
  error: SyntheticConstraintRefusal;
}) {
  const [summary] = error.message.split('\n');
  return (
    <>
      <p>{summary}</p>
      <ul className="list-disc space-y-1 pl-5">
        {error.conflicts.map((conflict, index) => (
          <ConstraintConflictItem
            key={[
              conflict.entity,
              conflict.entityType ?? '',
              conflict.variableIds.join('-'),
              conflict.rules.join('-'),
              index,
            ].join(':')}
            conflict={conflict}
          />
        ))}
      </ul>
    </>
  );
}
