import { useSelector } from 'react-redux';

import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import type { VariableRoleHit } from '@codaco/protocol-validation';
import { getVariableRoleConflicts } from '~/selectors/issues';
import { getProtocol } from '~/selectors/protocol';

/**
 * Every stage carries a required, non-empty `label`, so a hit's stage is
 * only ever missing when its `stageIndex` couldn't be resolved (see
 * `findVariableRoleConflicts`); that case still renders a legible fallback
 * instead of an empty string. De-duplicated so a stage writing the variable
 * from several prompts lists once, not once per hit.
 */
const describeHits = (
  stages: { label: string }[],
  hits: VariableRoleHit[],
): string =>
  [
    ...new Set(
      hits.map(
        (hit) =>
          (hit.stageIndex !== undefined
            ? stages[hit.stageIndex]?.label
            : undefined) ?? 'an unknown stage',
      ),
    ),
  ].join(', ');

/**
 * Timeline warning shown when a codebook variable is written both by a form
 * (validated) and by a bin/highlight/census/etc. elsewhere in the protocol.
 * Values written outside a form bypass the variable's validation rules, so a
 * form collecting the same variable can receive values it would otherwise
 * reject. Renders nothing when the protocol has no such conflicts.
 */
const VariableRoleConflictsAlert = () => {
  const conflicts = useSelector(getVariableRoleConflicts);
  const protocol = useSelector(getProtocol);

  if (conflicts.length === 0) {
    return null;
  }

  const stages = protocol?.stages ?? [];

  return (
    <Alert variant="warning" className="mx-auto mb-10 max-w-3xl">
      <AlertTitle>
        {conflicts.length === 1
          ? 'An attribute is written both with and without validation'
          : `${conflicts.length} attributes are written both with and without validation`}
      </AlertTitle>
      <AlertDescription>
        <span className="block">
          Values written outside a form bypass the attribute&apos;s validation
          rules, so forms elsewhere can receive values they would reject. For
          each attribute below, remove it from either the form or the other
          stage.
        </span>
        <ul className="mt-2 list-disc pl-5">
          {conflicts.map((conflict) => (
            <li
              key={`${conflict.subject.entity}:${conflict.subject.type ?? ''}:${conflict.variableId}`}
            >
              <strong>{conflict.variableName}</strong> — collected by a form in{' '}
              {describeHits(stages, conflict.validated)}; written without
              validation in {describeHits(stages, conflict.unvalidated)}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
};

export default VariableRoleConflictsAlert;
