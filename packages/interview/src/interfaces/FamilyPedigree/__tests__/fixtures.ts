import { isVariableId } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  entitySecureAttributesMeta,
  type NcEdge,
  type NcNode,
  type VariableValue,
} from '@codaco/shared-consts';

import { testTypeId, testVariableId } from '../../../__tests__/testIds';
import { encryptionFor } from '../../Anonymisation/__tests__/encryptionFixtures';
import { generateSecureAttributes } from '../../Anonymisation/utils';
import type { PedigreeConfig } from '../model';

/**
 * Attributes written with readable keys (`name`, `sex`, `isEgo`), filed
 * under the variable id each names. A key that is already an id is kept.
 */
const attributesById = (
  attributes: Record<string, VariableValue>,
): Record<string, VariableValue> =>
  Object.fromEntries(
    Object.entries(attributes).map(([key, value]) => [
      isVariableId(key) ? key : testVariableId(key),
      value,
    ]),
  );

export const config: PedigreeConfig = {
  personType: testTypeId('person'),
  nameAttribute: testVariableId('name'),
  genderIdentity: {
    attribute: testVariableId('gender'),
    terms: [
      { value: 'woman', words: 'feminine' },
      { value: 'man', words: 'masculine' },
      { value: 'nonBinary', words: 'neutral' },
      { value: 'unknown', words: 'unknown' },
      { value: 'transWoman', words: 'feminine' },
    ],
  },
  sexAssignedAtBirthAttribute: testVariableId('sex'),
  egoAttribute: testVariableId('isEgo'),
  relationshipType: testTypeId('family'),
  kindAttribute: testVariableId('kind'),
  gestationalCarrierAttribute: testVariableId('carrier'),
  currentPartnerAttribute: testVariableId('current'),
  relativesNotRecordedAttribute: testVariableId('notRecorded'),
  relationshipToParticipantAttribute: undefined,
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
  type: config.personType,
  [entityAttributesProperty]: attributesById(attributes),
});

/** A person whose name is stored encrypted with the key of the passphrase,
 * as the interview writes an encrypted name attribute. */
export async function encryptedPerson(
  id: string,
  name: string,
  passphrase: string,
  attributes: Record<string, VariableValue> = {},
): Promise<NcNode> {
  const { encryptedAttributes, secureAttributes } =
    await generateSecureAttributes(
      { [config.nameAttribute]: name },
      {
        [config.nameAttribute]: {
          type: 'text',
          component: 'Text',
          name: 'name',
          encrypted: true,
        },
      },
      (await encryptionFor(passphrase)).key,
      id,
    );
  return {
    ...person(id, { ...attributes, ...encryptedAttributes }),
    [entitySecureAttributesMeta]: secureAttributes,
  };
}

export const link = (
  from: string,
  to: string,
  kind: string,
  attributes: Record<string, VariableValue> = {},
): NcEdge => ({
  [entityPrimaryKeyProperty]: `${from}-${to}-${kind}`,
  type: config.relationshipType,
  from,
  to,
  [entityAttributesProperty]: {
    [config.kindAttribute]: [kind],
    ...attributesById(attributes),
  },
});
