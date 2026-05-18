import type { DocumentFragment } from '@xmldom/xmldom';

import type { Codebook } from '@codaco/protocol-validation';
import type { NcEgo } from '@codaco/shared-consts';

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
): Promise<DocumentFragment> {
  const fragment = createDocumentFragment();

  const createDomDataElement = (key: string, value: string) => {
    const dataElement = createDataElement({ key }, value);
    fragment.appendChild(dataElement);
  };

  const variables = getCodebookVariablesForEntity(entity, codebook);
  const entityAttributes = getEntityAttributes(entity);

  for (const [key, value] of Object.entries(entityAttributes)) {
    // Don't process empty values.
    if (value === null) {
      continue;
    }

    const codebookEntry = variables?.[key];

    // If there's no codebook entry for type, treat it as a string
    // TODO: try to detect the type from the value.
    if (!codebookEntry) {
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      createDomDataElement(key, String(value));
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

        const { x: xCoord, y: yCoord } = entityAttributes[key] as {
          x: number;
          y: number;
        };

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

        const rawValue = value as string | number | boolean | unknown[];
        // Cooerce value to string
        const coercedValue = String(rawValue);
        createDomDataElement(key, coercedValue);
        break;
      }
    }
  }

  return fragment;
}

export default processAttributes;
