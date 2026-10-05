import { entityAttributesProperty } from '@codaco/shared-consts';

import type { FieldValue, ValidationContext } from '../../store/types';
import {
  getValue,
  isSafeObjectPath,
  parseLegacyObjectPath,
} from '../../utils/objectPath';

const isFieldValueRecord = (
  value: unknown,
): value is Record<string, FieldValue> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasSafeOwnProperty = (value: object, property: string): boolean =>
  isSafeObjectPath([property]) && Object.hasOwn(value, property);

/**
 * Resolves the value of a comparison variable for the variable-comparison
 * validators (sameAs/differentFrom/greaterThanVariable/etc.).
 *
 * The interview network is a single shared graph, so a comparison target may
 * have been answered on a different form/stage and live only in the persisted
 * entity attributes — not in the current form's values. Form values take
 * precedence (they reflect in-progress edits); otherwise the value is sourced
 * from pending attributes for a new entity, then from the persisted entity
 * being edited. `present` is false only when the variable is absent from every
 * source, in which case the validator should no-op.
 */
export function getComparisonValue(
  formValues: Record<string, FieldValue>,
  attribute: string,
  context?: ValidationContext,
): { present: boolean; value: FieldValue | null } {
  const namespace =
    context?.formValueNamespacePath ??
    (context?.formValueNamespace
      ? parseLegacyObjectPath(context.formValueNamespace)
      : []);
  const formAlias =
    context?.formValueAliases &&
    Object.hasOwn(context.formValueAliases, attribute)
      ? context.formValueAliases[attribute]
      : undefined;
  const aliasPath = Array.isArray(formAlias) ? formAlias : undefined;
  const containerPath = aliasPath ? aliasPath.slice(0, -1) : namespace;
  const formKey = aliasPath
    ? aliasPath.at(-1)
    : typeof formAlias === 'string'
      ? formAlias
      : attribute;
  const formContainer = containerPath
    ? getValue(formValues, containerPath)
    : undefined;

  if (
    formKey !== undefined &&
    isFieldValueRecord(formContainer) &&
    hasSafeOwnProperty(formContainer, String(formKey))
  ) {
    return {
      present: true,
      value: formContainer[String(formKey)],
    };
  }

  if (!context) {
    return { present: false, value: undefined };
  }

  const { stageSubject, network, currentEntityId, currentEntityAttributes } =
    context;

  if (
    currentEntityAttributes &&
    hasSafeOwnProperty(currentEntityAttributes, attribute)
  ) {
    return { present: true, value: currentEntityAttributes[attribute] };
  }

  const attributes =
    stageSubject.entity === 'ego'
      ? network.ego[entityAttributesProperty]
      : (stageSubject.entity === 'node' ? network.nodes : network.edges).find(
          (entity) => entity._uid === currentEntityId,
        )?.[entityAttributesProperty];

  if (attributes && hasSafeOwnProperty(attributes, attribute)) {
    return { present: true, value: attributes[attribute] };
  }

  return { present: false, value: undefined };
}
