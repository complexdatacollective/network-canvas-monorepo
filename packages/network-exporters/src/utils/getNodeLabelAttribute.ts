import type { NodeDefinition } from '@codaco/protocol-validation';
import type { NcNode } from '@codaco/shared-consts';

import { isEncryptedAttribute } from './encryptedAttribute';
import { getEntityAttributes, getOwn } from './general';

type NodeVariable = NonNullable<NodeDefinition['variables']>[string];

const isValidLabelCandidate = (
  node: NcNode,
  attribute: string,
  variableDefinition?: NodeVariable,
) => {
  const value = getOwn(getEntityAttributes(node), attribute);
  if (value === undefined || value === '') {
    return false;
  }

  if (
    variableDefinition &&
    variableDefinition.type !== 'text' &&
    variableDefinition.type !== 'number' &&
    variableDefinition.type !== 'datetime' &&
    variableDefinition.type !== 'location'
  ) {
    return false;
  }

  if (isEncryptedAttribute(node, attribute, variableDefinition)) {
    return true;
  }

  return typeof value === 'string' || typeof value === 'number';
};

export const getNodeLabelAttribute = (
  codebookVariables: NodeDefinition['variables'],
  node: NcNode,
): string | null => {
  const variableCalledName = Object.entries(codebookVariables ?? {}).find(
    ([, variable]) => variable.name.toLowerCase() === 'name',
  );

  if (
    variableCalledName &&
    isValidLabelCandidate(node, variableCalledName[0], variableCalledName[1])
  ) {
    return variableCalledName[0];
  }

  const test = /name/i;
  const match = Object.keys(codebookVariables ?? {}).find(
    (attribute) =>
      test.test(attribute) &&
      isValidLabelCandidate(
        node,
        attribute,
        getOwn(codebookVariables, attribute),
      ),
  );

  if (match) {
    return match;
  }

  const nodeVariableCalledName = Object.keys(getEntityAttributes(node)).find(
    (attribute) =>
      test.test(attribute) && isValidLabelCandidate(node, attribute),
  );

  if (nodeVariableCalledName) {
    return nodeVariableCalledName;
  }

  const textVariables = Object.entries(codebookVariables ?? {}).filter(
    ([_key, variable]) => variable.type === 'text',
  );

  for (const [variableKey, variable] of textVariables) {
    if (isValidLabelCandidate(node, variableKey, variable)) {
      return variableKey;
    }
  }

  return null;
};
