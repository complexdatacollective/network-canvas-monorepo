import { useSelector } from 'react-redux';

import { type IntlShape, defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import type { VariableRoleHit } from '@codaco/protocol-validation';
import { getVariableRoleConflicts } from '~/selectors/issues';
import { getProtocol } from '~/selectors/protocol';
const messages = defineMessages({
  unknownStage: {
    id: 'architect.variableRoleConflictsAlert.unknownStage',
    defaultMessage: 'an unknown stage',
    description: 'Fallback for a referenced stage no longer in the protocol.',
  },
  anAttributeIsWrittenBothWith: {
    id: 'architect.variableRoleConflictsAlert.anAttributeIsWrittenBothWith',
    defaultMessage: 'An attribute is written both with and without validation',
    description: 'Visible text in components / VariableRoleConflictsAlert.',
  },
  attributesAreWrittenBothWith: {
    id: 'architect.variableRoleConflictsAlert.attributesAreWrittenBothWith',
    defaultMessage:
      '{value1} attributes are written both with and without validation',
    description: 'Visible text in components / VariableRoleConflictsAlert.',
  },
  valuesWrittenOutsideAFormBypass: {
    id: 'architect.variableRoleConflictsAlert.valuesWrittenOutsideAFormBypass',
    defaultMessage:
      "Values written outside a form bypass the attribute's validation rules, so forms elsewhere can receive values they would reject. For each attribute below, remove it from either the form or the other stage.",
    description: 'Visible text in components / VariableRoleConflictsAlert.',
  },
  collectedByAForm: {
    id: 'architect.variableRoleConflictsAlert.collectedByAForm',
    defaultMessage:
      '<strong>{value1}</strong> — collected by a form in {value3}; written without validation in {value4}',
    description: 'Visible text in components / VariableRoleConflictsAlert.',
  },
});

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
  intl: IntlShape,
): string =>
  intl.formatList([
    ...new Set(
      hits.map(
        (hit) =>
          (hit.stageIndex !== undefined
            ? stages[hit.stageIndex]?.label
            : undefined) ?? intl.formatMessage(messages.unknownStage),
      ),
    ),
  ]);

/**
 * Timeline warning shown when a codebook variable is written both by a form
 * (validated) and by a bin/highlight/census/etc. elsewhere in the protocol.
 * Values written outside a form bypass the variable's validation rules, so a
 * form collecting the same variable can receive values it would otherwise
 * reject. Renders nothing when the protocol has no such conflicts.
 */
const VariableRoleConflictsAlert = () => {
  const intl = useAppIntl();
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
          ? intl.formatMessage(messages.anAttributeIsWrittenBothWith)
          : intl.formatMessage(messages.attributesAreWrittenBothWith, {
              value1: conflicts.length,
            })}
      </AlertTitle>
      <AlertDescription>
        <span className="block">
          {intl.formatMessage(messages.valuesWrittenOutsideAFormBypass)}
        </span>
        <ul className="mt-2 list-disc pl-5">
          {conflicts.map((conflict) => (
            <li
              key={`${conflict.subject.entity}:${conflict.subject.type ?? ''}:${conflict.variableId}`}
            >
              {intl.formatMessage(messages.collectedByAForm, {
                value1: conflict.variableName,
                strong: (chunks) => <strong>{chunks}</strong>,
                value3: describeHits(stages, conflict.validated, intl),
                value4: describeHits(stages, conflict.unvalidated, intl),
              })}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
};

export default VariableRoleConflictsAlert;
