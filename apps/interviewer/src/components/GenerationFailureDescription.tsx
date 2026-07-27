import { ScrollArea } from '@codaco/fresco-ui/ScrollArea';
import type {
  ConstraintConflict,
  SyntheticDataConstraintError,
} from '@codaco/protocol-utilities';

// Mirrors the bullet wording `SyntheticDataConstraintError` composes into its
// flat, newline-joined message (see
// packages/protocol-utilities/src/generateNetwork/constraints/error.ts), but
// renders each conflict as its own list item so the toast stays readable
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
 * A protocol can declare arbitrarily many clashing rules, and the toast that
 * shows them is anchored to the bottom of the screen and grows upwards — so an
 * unbounded list carries its own title and Close control off the top, leaving
 * the researcher unable to read the failure or dismiss it by pointer. The list
 * is therefore capped and scrolls within itself, which keeps the toast on
 * screen however many conflicts a protocol produces. `ScrollArea` is
 * keyboard-focusable, so the conflicts stay reachable without a mouse.
 */
export function GenerationFailureDescription({
  error,
}: {
  error: SyntheticDataConstraintError;
}) {
  const [summary] = error.message.split('\n');
  return (
    <>
      <p>{summary}</p>
      <ScrollArea
        className="max-h-[30vh]"
        viewportClassName="pr-2"
        aria-label="Conflicting validation rules"
      >
        <ul className="list-disc space-y-1 pl-5">
          {error.conflicts.map((conflict) => (
            <ConstraintConflictItem
              key={`${conflict.entity}-${conflict.variableIds.join('-')}`}
              conflict={conflict}
            />
          ))}
        </ul>
      </ScrollArea>
    </>
  );
}
