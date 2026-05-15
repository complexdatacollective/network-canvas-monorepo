import type { NodeDefinition } from '@codaco/protocol-validation';
import type { EntityAttributesProperty, NcNode } from '@codaco/shared-consts';

const isValidLabelCandidate = (
  value: unknown,
  variableDefinition?: NonNullable<NodeDefinition['variables']>[string],
) => {
  if (value === null || value === undefined || value === '') {
    return false;
  }

  const type = typeof value;

  if (!variableDefinition) {
    if (type === 'string' || type === 'number') {
      return true;
    }
  } else {
    if (
      variableDefinition.type === 'text' ||
      variableDefinition.type === 'number' ||
      variableDefinition.type === 'datetime' ||
      variableDefinition.type === 'location'
    ) {
      if (variableDefinition.encrypted) {
        return true;
      }

      return type === 'string' || type === 'number';
    }
  }

  return false;
};

export const getNodeLabelAttribute = (
  codebookVariables: NodeDefinition['variables'],
  nodeAttributes: NcNode[EntityAttributesProperty],
): string | null => {
  const variableCalledName = Object.entries(codebookVariables ?? {}).find(
    ([, variable]) => variable.name.toLowerCase() === 'name',
  );

  if (
    variableCalledName &&
    isValidLabelCandidate(
      nodeAttributes[variableCalledName[0]],
      variableCalledName[1],
    )
  ) {
    return variableCalledName[0];
  }

  const test = /name/i;
  const match = Object.keys(codebookVariables ?? {}).find(
    (attribute) =>
      test.test(attribute) &&
      isValidLabelCandidate(
        nodeAttributes[attribute],
        codebookVariables?.[attribute],
      ),
  );

  if (match) {
    return match;
  }

  const nodeVariableCalledName = Object.keys(nodeAttributes).find(
    (attribute) =>
      test.test(attribute) && isValidLabelCandidate(nodeAttributes[attribute]),
  );

  if (nodeVariableCalledName) {
    return nodeVariableCalledName;
  }

  const textVariables = Object.entries(codebookVariables ?? {}).filter(
    ([_key, variable]) => variable.type === 'text',
  );

  for (const [variableKey] of textVariables) {
    if (
      isValidLabelCandidate(
        nodeAttributes[variableKey],
        codebookVariables?.[variableKey],
      )
    ) {
      return variableKey;
    }
  }

  return null;
};
