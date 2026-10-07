import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcEdge,
  type NcNode,
  type VariableValue,
} from '@codaco/shared-consts';

import type { PedigreeConfig } from '../model';

export const config: PedigreeConfig = {
  personType: 'person',
  nameAttribute: 'name',
  genderIdentity: {
    attribute: 'gender',
    terms: [
      { value: 'woman', words: 'feminine' },
      { value: 'man', words: 'masculine' },
      { value: 'nonBinary', words: 'neutral' },
      { value: 'unknown', words: 'unknown' },
      { value: 'transWoman', words: 'feminine' },
    ],
  },
  sexAssignedAtBirthAttribute: 'sex',
  egoAttribute: 'isEgo',
  relationshipType: 'family',
  kindAttribute: 'kind',
  gestationalCarrierAttribute: 'carrier',
  currentPartnerAttribute: 'current',
  relativesNotRecordedAttribute: 'notRecorded',
};

/** The same stage with gender identity not collected. */
export const configWithoutGenderIdentity: PedigreeConfig = {
  ...config,
  genderIdentity: undefined,
};

export const person = (
  id: string,
  attributes: Record<string, VariableValue> = {},
): NcNode => ({
  [entityPrimaryKeyProperty]: id,
  type: 'person',
  [entityAttributesProperty]: attributes,
});

export const link = (
  from: string,
  to: string,
  kind: string,
  attributes: Record<string, VariableValue> = {},
): NcEdge => ({
  [entityPrimaryKeyProperty]: `${from}-${to}-${kind}`,
  type: 'family',
  from,
  to,
  [entityAttributesProperty]: { kind: [kind], ...attributes },
});
