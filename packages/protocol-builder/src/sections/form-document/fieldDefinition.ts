import type { ProtocolFieldDefinition } from '@codaco/interview';
import {
  ComponentTypesKeys,
  type LocalizedString,
  type Variable,
} from '@codaco/protocol-validation';

import { completeRuleValues } from '../../codebook/variableValidation.ts';
import { asLocalizedString } from '../../localization/localizedText.ts';
import { controlsForType, isCollectableType } from '../collectableTypes.ts';

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

type FieldOption = NonNullable<ProtocolFieldDefinition['options']>[number];

/** The options of an attribute as the interview takes them. */
const fieldOptions = (options: unknown): FieldOption[] | undefined =>
  Array.isArray(options)
    ? options.flatMap((option): FieldOption[] => {
        if (!isRecord(option)) return [];
        const label = asLocalizedString(option.label);
        const { value } = option;
        if (
          label === undefined ||
          !(
            typeof value === 'string' ||
            typeof value === 'number' ||
            typeof value === 'boolean'
          )
        ) {
          return [];
        }
        return [
          {
            label,
            value,
            ...(option.negative === true && { negative: true }),
          },
        ];
      })
    : undefined;

const isInputControl = (
  value: unknown,
): value is ProtocolFieldDefinition['component'] =>
  typeof value === 'string' &&
  ComponentTypesKeys.some((control) => control === value);

/** The control an attribute is collected with: its own, else the first its type offers. */
export const controlOf = (
  variable: Readonly<Variable>,
): ProtocolFieldDefinition['component'] | undefined => {
  const own: unknown = Reflect.get(variable, 'component');
  const offered = controlsForType(variable.type).map(({ value }) => value);
  if (isInputControl(own) && offered.includes(own)) return own;
  const first = offered[0];
  return isInputControl(first) ? first : undefined;
};

/**
 * The field as the interview draws its control: the attribute's control,
 * options, settings and validation, from the codebook as the stage has
 * changed it.
 */
export const fieldDefinitionOf = (
  variableId: string,
  variable: Readonly<Variable> | undefined,
  showValidationHints: boolean,
  label: LocalizedString,
): ProtocolFieldDefinition | undefined => {
  if (variable === undefined || !isCollectableType(variable.type)) {
    return undefined;
  }
  const component = controlOf(variable);
  if (component === undefined) return undefined;
  const options = fieldOptions(Reflect.get(variable, 'options'));
  const parameters: unknown = Reflect.get(variable, 'parameters');
  const rules: unknown = Reflect.get(variable, 'validation');
  return {
    variable: variableId,
    label,
    type: variable.type,
    component,
    ...(showValidationHints && { showValidationHints: true }),
    ...(options !== undefined && { options }),
    ...(isRecord(parameters) && { parameters }),
    ...(isRecord(rules) && { validation: completeRuleValues(rules) }),
  };
};
