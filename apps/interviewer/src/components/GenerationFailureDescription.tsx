import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import type {
  ConstraintConflict,
  SyntheticDataConstraintError,
} from '@codaco/protocol-utilities';
import { formatConstraintConflictReason } from '@codaco/protocol-utilities/messages';
import { formatValidationRule } from '@codaco/protocol-validation/messages';

const messages = defineMessages({
  summary: {
    id: 'interviewer.generationFailureDescription.summary',
    defaultMessage:
      'Synthetic data could not be generated. Review the conflicting rules below and adjust the protocol in Architect.',
    description:
      'Actionable summary of synthetic data generation refusal, above the specific conflicting rules and repair guidance.',
  },
  conflict: {
    id: 'interviewer.generationFailureDescription.conflict',
    defaultMessage:
      '{entity, select, ego {Participant} node {Node "{entityType}"} edge {Edge "{entityType}"} other {{entityType}}}, {variables} ({rules}): {reason}',
    description:
      'One synthetic generation conflict. entity selects the codebook entity; entityType and variable names are unchanged researcher-authored names. rules is a localized list and reason is a complete localized repair explanation.',
  },
});

function ConstraintConflictItem({
  conflict,
}: {
  conflict: ConstraintConflict;
}) {
  const intl = useAppIntl();
  return (
    <li>
      {intl.formatMessage(messages.conflict, {
        entity: conflict.entity,
        entityType: conflict.entityTypeName ?? conflict.entityType ?? '',
        variables: intl.formatList(conflict.variableNames),
        rules: intl.formatList(
          conflict.rules.map((rule) => formatValidationRule(rule, intl)),
        ),
        reason: formatConstraintConflictReason(conflict, intl),
      })}
    </li>
  );
}

// Toast bounds and scrolls long descriptions, keeping the title and Close
// control visible while each refusal retains its actionable repair guidance.
export function GenerationFailureDescription({
  error,
}: {
  error: SyntheticDataConstraintError;
}) {
  const intl = useAppIntl();
  return (
    <>
      <p>{intl.formatMessage(messages.summary)}</p>
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
