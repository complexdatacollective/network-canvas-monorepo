// Determine which variables to include

import type { Codebook, EntityDefinition } from '@codaco/protocol-validation';
import {
  type NcEdge,
  type NcEgo,
  type NcNode,
  categoricalOptionColumn,
  entityAttributesProperty,
  layoutColumn,
} from '@codaco/shared-consts';

import type { ExportOptions } from '../../options';
import {
  getEntityAttributes,
  getOwn,
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
  // Keyed by researcher-authored names, so it must have no prototype: a
  // variable named `__proto__` would otherwise be lost, and one named
  // `toString` read back as a function.
  const attributes: Record<string, unknown> = Object.create(null);

  for (const [attributeUUID, attributeData] of Object.entries(
    getEntityAttributes(entityObject),
  )) {
    let codebookAttribute: VariableDefinition | undefined;

    if (entity === 'ego') {
      codebookAttribute = getOwn(codebook.ego?.variables, attributeUUID);
    } else if ('type' in entityObject) {
      codebookAttribute = getOwn(
        getOwn(codebook[entity], entityObject.type)?.variables,
        attributeUUID,
      );
    }

    const attributeIsEncrypted = codebookAttribute?.encrypted;
    if (codebookAttribute?.type === 'categorical') {
      for (const option of codebookAttribute.options) {
        const key = categoricalOptionColumn(
          codebookAttribute.name,
          option.value,
        );
        if (attributeIsEncrypted) {
          attributes[key] = 'ENCRYPTED';
        } else {
          attributes[key] = isCategoricalOptionSelected(
            attributeData,
            option.value,
          );
        }
      }
      continue;
    }

    if (codebookAttribute?.type === 'layout') {
      const { name } = codebookAttribute;
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
        attributes[layoutColumn('csv', name, 'x')] = 'ENCRYPTED';
        attributes[layoutColumn('csv', name, 'y')] = 'ENCRYPTED';
        continue;
      }

      attributes[layoutColumn('csv', name, 'x')] = xCoord;
      attributes[layoutColumn('csv', name, 'y')] = yCoord;

      if (
        exportOptions.globalOptions.useScreenLayoutCoordinates &&
        xCoord !== undefined &&
        yCoord !== undefined
      ) {
        const { screenLayoutWidth, screenLayoutHeight } =
          exportOptions.globalOptions;
        attributes[layoutColumn('csv', name, 'screenSpaceX')] = (
          xCoord * screenLayoutWidth
        ).toFixed(2);
        attributes[layoutColumn('csv', name, 'screenSpaceY')] = (
          (1.0 - yCoord) *
          screenLayoutHeight
        ).toFixed(2);
      }
      continue;
    }

    if (codebookAttribute?.name) {
      attributes[codebookAttribute.name] = attributeIsEncrypted
        ? 'ENCRYPTED'
        : attributeData;
    } else {
      attributes[attributeUUID] = attributeData;
    }
  }

  return { ...entityObject, [entityAttributesProperty]: attributes };
};

export default processEntityVariables;
