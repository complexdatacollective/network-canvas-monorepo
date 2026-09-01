// Determine which variables to include

import type { Codebook, EntityDefinition } from '@codaco/protocol-validation';
import {
  type NcEdge,
  type NcEgo,
  type NcNode,
  entityAttributesProperty,
} from '@codaco/shared-consts';

import type { ExportOptions } from '../../options';
import {
  getEntityAttributes,
  isCategoricalOptionSelected,
} from '../../utils/general';

// TODO: move to protocol validation
export type VariableDefinition = NonNullable<
  EntityDefinition['variables']
>[string];

const processEntityVariables = <Entity extends NcEdge | NcNode | NcEgo>(
  entityObject: Entity,
  entity: 'ego' | 'node' | 'edge',
  codebook: Codebook,
  exportOptions: ExportOptions,
) => {
  const attributes: Record<string, unknown> = {};

  for (const [attributeUUID, attributeData] of Object.entries(
    getEntityAttributes(entityObject),
  )) {
    let codebookAttribute: VariableDefinition | undefined;

    if (entity === 'ego') {
      codebookAttribute = codebook.ego?.variables?.[attributeUUID];
    } else if ('type' in entityObject) {
      codebookAttribute =
        codebook[entity]?.[entityObject.type]?.variables?.[attributeUUID];
    }

    const attributeName = codebookAttribute?.name;
    const attributeType = codebookAttribute?.type;
    const attributeIsEncrypted = codebookAttribute?.encrypted;
    if (attributeType === 'categorical') {
      const attributeOptions = codebookAttribute?.options ?? [];

      for (const optionName of attributeOptions) {
        const key = `${attributeName}_${optionName.value}`;
        if (attributeIsEncrypted) {
          attributes[key] = 'ENCRYPTED';
        } else {
          attributes[key] = isCategoricalOptionSelected(
            attributeData,
            optionName.value,
          );
        }
      }
      continue;
    }

    if (attributeType === 'layout') {
      const xCoord =
        typeof attributeData === 'object' &&
        !Array.isArray(attributeData) &&
        'x' in attributeData &&
        typeof attributeData.x === 'number'
          ? attributeData.x
          : undefined;
      const yCoord =
        typeof attributeData === 'object' &&
        !Array.isArray(attributeData) &&
        'y' in attributeData &&
        typeof attributeData.y === 'number'
          ? attributeData.y
          : undefined;

      if (attributeIsEncrypted) {
        attributes[`${attributeName}_x`] = 'ENCRYPTED';
        attributes[`${attributeName}_y`] = 'ENCRYPTED';
        continue;
      }

      attributes[`${attributeName}_x`] = xCoord;
      attributes[`${attributeName}_y`] = yCoord;

      if (
        exportOptions.globalOptions.useScreenLayoutCoordinates &&
        xCoord !== undefined &&
        yCoord !== undefined
      ) {
        const { screenLayoutWidth, screenLayoutHeight } =
          exportOptions.globalOptions;
        attributes[`${attributeName}_screenSpaceX`] = (
          xCoord * screenLayoutWidth
        ).toFixed(2);
        attributes[`${attributeName}_screenSpaceY`] = (
          (1.0 - yCoord) *
          screenLayoutHeight
        ).toFixed(2);
      }
      continue;
    }

    if (attributeName) {
      attributes[attributeName] = attributeIsEncrypted
        ? 'ENCRYPTED'
        : attributeData;
    } else {
      attributes[attributeUUID] = attributeData;
    }
  }

  return { ...entityObject, [entityAttributesProperty]: attributes };
};

export default processEntityVariables;
