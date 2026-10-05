import type { DocumentFragment } from '@xmldom/xmldom';

import type { Codebook } from '@codaco/protocol-validation';
import {
  type LayoutColumnAxis,
  type NcEgo,
  type VariableValue,
  variableExportColumnEntries,
} from '@codaco/shared-consts';

import type { EdgeWithResequencedID, NodeWithResequencedID } from '../../input';
import type { ExportOptions } from '../../options';
import {
  getEntityAttributes,
  getOwn,
  isCategoricalOptionSelected,
} from '../../utils/general';
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
  }
};

/**
 * Function for processing attributes of an entity. Processing means creating
 * one or more <data> elements for each attribute, under the key ids
 * `generateKeyElements` gave each column.
 */
function processAttributes(
  entity: NodeWithResequencedID | EdgeWithResequencedID | NcEgo,
  codebook: Codebook,
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

    if (!codebookEntry) {
      const externalKey = keyIds.external.get(key);
      if (!externalKey) {
        throw new Error(`Missing GraphML key for external attribute: ${key}`);
      }
      createDomDataElement(externalKey, stringifyValue(value));
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

    if (codebookEntry.encrypted) {
      // An encrypted value is never exported. A layout variable writes the
      // marker for its coordinates only.
      for (const { id, origin } of columns) {
        if (
          origin.kind !== 'layout' ||
          origin.axis === 'x' ||
          origin.axis === 'y'
        ) {
          createDomDataElement(id, 'ENCRYPTED');
        }
      }
      continue;
    }

    if (codebookEntry.type === 'layout') {
      if (
        typeof value !== 'object' ||
        Array.isArray(value) ||
        !('x' in value) ||
        !('y' in value) ||
        typeof value.x !== 'number' ||
        typeof value.y !== 'number'
      ) {
        continue;
      }
      for (const { id, origin } of columns) {
        if (origin.kind === 'layout') {
          createDomDataElement(
            id,
            layoutDatum(origin.axis, value.x, value.y, exportOptions),
          );
        }
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
