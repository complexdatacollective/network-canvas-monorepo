import type { DocumentFragment } from '@xmldom/xmldom';

import type { Codebook } from '@codaco/protocol-validation';
import type { NcEgo, VariableValue } from '@codaco/shared-consts';

import type { EdgeWithResequencedID, NodeWithResequencedID } from '../../input';
import type { ExportOptions } from '../../options';
import {
  getEntityAttributes,
  isCategoricalOptionSelected,
} from '../../utils/general';
import {
  createDataElement,
  createDocumentFragment,
  getCodebookVariablesForEntity,
  sha1,
} from './helpers';

/**
 * Function for processing attributes of an entity. Processing means creating
 * one or more <data> elements for each attribute.
 */
async function processAttributes(
  entity: NodeWithResequencedID | EdgeWithResequencedID | NcEgo,
  codebook: Codebook,
  exportOptions: ExportOptions,
  externalKeyIds: ReadonlyMap<string, string>,
): Promise<DocumentFragment> {
  const fragment = createDocumentFragment();

  const createDomDataElement = (key: string, value: string) => {
    const dataElement = createDataElement({ key }, value);
    fragment.appendChild(dataElement);
  };

  const variables = getCodebookVariablesForEntity(entity, codebook);
  const entityAttributes = getEntityAttributes(entity);

  for (const [key, value] of Object.entries(entityAttributes)) {
    const codebookEntry = variables?.[key];

    if (!codebookEntry) {
      const externalKey = externalKeyIds.get(key);
      if (!externalKey) {
        throw new Error(`Missing GraphML key for external attribute: ${key}`);
      }
      createDomDataElement(externalKey, stringifyValue(value));
      continue;
    }

    const variableIsEncrypted = codebookEntry.encrypted;

    switch (codebookEntry.type) {
      case 'categorical': {
        const options = codebookEntry.options;
        const hashedValues = await Promise.all(
          options.map((option) => sha1(String(option.value))),
        );

        if (variableIsEncrypted) {
          // If the variable is encrypted, we don't want to export it.
          options.forEach((_option, index) => {
            const optionKey = `${key}_${hashedValues[index]}`;
            createDomDataElement(optionKey, 'ENCRYPTED');
          });
          break;
        }

        options.forEach((option, index) => {
          const optionKey = `${key}_${hashedValues[index]}`;

          const attributeValue = entityAttributes[key];
          const isSelected = isCategoricalOptionSelected(
            attributeValue,
            option.value,
          );
          createDomDataElement(optionKey, isSelected ? 'true' : 'false');
        });

        break;
      }
      case 'layout': {
        if (variableIsEncrypted) {
          // If the variable is encrypted, we don't want to export it.
          createDomDataElement(`${key}_X`, 'ENCRYPTED');
          createDomDataElement(`${key}_Y`, 'ENCRYPTED');
          break;
        }

        if (
          typeof value !== 'object' ||
          Array.isArray(value) ||
          !('x' in value) ||
          !('y' in value) ||
          typeof value.x !== 'number' ||
          typeof value.y !== 'number'
        ) {
          break;
        }

        const { x: xCoord, y: yCoord } = value;

        createDomDataElement(`${key}_X`, String(xCoord));
        createDomDataElement(`${key}_Y`, String(yCoord));

        if (exportOptions.globalOptions.useScreenLayoutCoordinates) {
          const { screenLayoutWidth, screenLayoutHeight } =
            exportOptions.globalOptions;
          const screenSpaceXCoord = (xCoord * screenLayoutWidth).toFixed(2);
          const screenSpaceYCoord = (
            (1.0 - yCoord) *
            screenLayoutHeight
          ).toFixed(2);

          createDomDataElement(`${key}_screenSpaceX`, screenSpaceXCoord);
          createDomDataElement(`${key}_screenSpaceY`, screenSpaceYCoord);
        }
        break;
      }

      case 'boolean':
      case 'number':
      case 'text':
      case 'datetime':
      case 'location':
      case 'ordinal':
      case 'scalar': {
        if (variableIsEncrypted) {
          createDomDataElement(key, 'ENCRYPTED');
          break;
        }

        createDomDataElement(key, stringifyValue(value));
        break;
      }
    }
  }

  return fragment;
}

const stringifyValue = (value: VariableValue): string =>
  typeof value === 'object' ? JSON.stringify(value) : String(value);

export default processAttributes;
