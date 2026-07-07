import { entityAttributesProperty } from '@codaco/shared-consts';

import type { FieldValue, ValidationContext } from '../../store/types';

/**
 * Resolves the value of a comparison variable for the variable-comparison
 * validators (sameAs/differentFrom/greaterThanVariable/etc.).
 *
 * The interview network is a single shared graph, so a comparison target may
 * have been answered on a different form/stage and live only in the persisted
 * entity attributes — not in the current form's values. Form values take
 * precedence (they reflect in-progress edits); otherwise the value is sourced
 * from the entity being edited (ego, or the node/edge identified by
 * currentEntityId). `present` is false only when the variable is neither a
 * current-form field nor a recorded attribute, in which case the validator
 * should no-op (it can't compare against an absent value).
 */
export function getComparisonValue(
  formValues: Record<string, FieldValue>,
  attribute: string,
  context?: ValidationContext,
): { present: boolean; value: FieldValue | null } {
  if (attribute in formValues) {
    return { present: true, value: formValues[attribute] };
  }

  if (!context) {
    return { present: false, value: undefined };
  }

  const { stageSubject, network, currentEntityId } = context;

  const attributes =
    stageSubject.entity === 'ego'
      ? network.ego[entityAttributesProperty]
      : (stageSubject.entity === 'node' ? network.nodes : network.edges).find(
          (entity) => entity._uid === currentEntityId,
        )?.[entityAttributesProperty];

  if (attributes && attribute in attributes) {
    return { present: true, value: attributes[attribute] };
  }

  return { present: false, value: undefined };
}
