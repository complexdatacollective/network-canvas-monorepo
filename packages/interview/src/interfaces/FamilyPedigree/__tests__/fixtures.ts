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
  nameVariable: 'name',
  genderIdentityVariable: 'gender',
  genderIdentityTerms: [
    { value: 'woman', words: 'feminine' },
    { value: 'man', words: 'masculine' },
    { value: 'nonBinary', words: 'neutral' },
    { value: 'unknown', words: 'unknown' },
    { value: 'transWoman', words: 'feminine' },
  ],
  sexAssignedAtBirthVariable: 'sex',
  egoVariable: 'isEgo',
  relationshipType: 'family',
  kindVariable: 'kind',
  gestationalCarrierVariable: 'carrier',
  currentPartnerVariable: 'current',
  relativesNotRecordedVariable: 'notRecorded',
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
