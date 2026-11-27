import type { DocumentFragment } from '@xmldom/xmldom';

import {
  type LayoutColumnAxis,
  type NcEgo,
  type VariableValue,
  variableExportColumnEntries,
} from '@codaco/shared-consts';

import type {
  EdgeWithResequencedID,
  NodeWithResequencedID,
  ExportCodebook,
} from '../../input';
import type { ExportOptions } from '../../options';
import { isEncryptedAttribute } from '../../utils/encryptedAttribute';
import {
  getEntityAttributes,
  getOwn,
  isCategoricalOptionSelected,
} from '../../utils/general';
import { positionOf } from '../../utils/layouts';
import {
  createDataElement,
  createDocumentFragment,
  getCodebookVariablesForEntity,
} from './helpers';
import type { GraphMLKeyIds } from './keyIds';

const layoutDatum = (
  axis: LayoutColumnAxis,
  x: number,
  y: number,
  { globalOptions }: ExportOptions,
): string => {
  switch (axis) {
    case 'x':
      return String(x);
    case 'y':
      return String(y);
    case 'screenSpaceX':
      return (x * globalOptions.screenLayoutWidth).toFixed(2);
    case 'screenSpaceY':
      return ((1.0 - y) * globalOptions.screenLayoutHeight).toFixed(2);
    default: {
      const unhandled: never = axis;
      throw new Error('Unhandled layout axis', { cause: unhandled });
    }
  }
};

/**
 * Function for processing attributes of an entity. Processing means creating
 * one or more <data> elements for each attribute, under the key ids
 * `generateKeyElements` gave each column.
 */
function processAttributes(
  entity: NodeWithResequencedID | EdgeWithResequencedID | NcEgo,
  codebook: ExportCodebook,
  exportOptions: ExportOptions,
  keyIds: GraphMLKeyIds,
): DocumentFragment {
  const fragment = createDocumentFragment();

  const createDomDataElement = (key: string, value: string) => {
    const dataElement = createDataElement({ key }, value);
    fragment.appendChild(dataElement);
  };

  const variables = getCodebookVariablesForEntity(entity, codebook);
  const entityAttributes = getEntityAttributes(entity);

  for (const [key, value] of Object.entries(entityAttributes)) {
    const codebookEntry = getOwn(variables, key);
    const encrypted = isEncryptedAttribute(entity, key, codebookEntry);

    const layoutKeys = codebookEntry ? undefined : keyIds.layout.get(key);
    if (layoutKeys !== undefined) {
      const columns = variableExportColumnEntries(
        { name: key, type: 'layout' },
        {
          format: 'graphml',
          useScreenLayoutCoordinates:
            exportOptions.globalOptions.useScreenLayoutCoordinates,
        },
      ).map(({ origin }, index) => {
        const id = layoutKeys[index];
        if (id === undefined) {
          throw new Error(`Missing GraphML key for layout: ${key}`);
        }
        return { id, origin };
      });
      const position = positionOf(value);
      for (const { id, origin } of columns) {
        if (origin.kind !== 'layout') continue;
        if (encrypted) {
          // An encrypted position writes the marker for its coordinates only.
          if (origin.axis === 'x' || origin.axis === 'y') {
            createDomDataElement(id, 'ENCRYPTED');
          }
          continue;
        }
        if (position !== undefined) {
          createDomDataElement(
            id,
            layoutDatum(origin.axis, position.x, position.y, exportOptions),
          );
        }
      }
      continue;
    }

    if (!codebookEntry) {
      const externalKey = keyIds.external.get(key);
      if (!externalKey) {
        throw new Error(`Missing GraphML key for external attribute: ${key}`);
      }
      createDomDataElement(
        externalKey,
        encrypted ? 'ENCRYPTED' : stringifyValue(value),
      );
      continue;
    }

    const ids = keyIds.variable.get(codebookEntry);
    const columns = variableExportColumnEntries(codebookEntry, {
      format: 'graphml',
      useScreenLayoutCoordinates:
        exportOptions.globalOptions.useScreenLayoutCoordinates,
    }).map(({ origin }, index) => {
      const id = ids?.[index];
      if (id === undefined) {
        throw new Error(`Missing GraphML key for variable: ${key}`);
      }
      return { id, origin };
    });

    if (encrypted) {
      // An encrypted value is never exported.
      for (const { id } of columns) {
        createDomDataElement(id, 'ENCRYPTED');
      }
      continue;
    }

    for (const { id, origin } of columns) {
      createDomDataElement(
        id,
        origin.kind === 'option'
          ? String(isCategoricalOptionSelected(value, origin.value))
          : stringifyValue(value),
      );
    }
  }

  return fragment;
}

const stringifyValue = (value: VariableValue): string =>
  typeof value === 'object' ? JSON.stringify(value) : String(value);

export default processAttributes;
