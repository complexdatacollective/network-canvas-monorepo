import sanitizeFilename from 'sanitize-filename';

import {
  caseProperty,
  type NcEntity,
  entityAttributesProperty,
  entitySecureAttributesMeta,
  sessionProperty,
} from '@codaco/shared-consts';

import type { SessionWithResequencedIDs } from '../input';
import type { ExportFormat } from '../options';

const escapeFilePart = (part: string) => part.replace(/\W/g, '');

export const makeFilename = (
  prefix: string,
  entityName: string | undefined,
  exportFormat: string,
  extension: string,
) => {
  let name = prefix;
  if (extension !== `.${exportFormat}`) {
    name += name ? '_' : '';
    name += exportFormat;
  }
  if (entityName) {
    name += `_${escapeFilePart(entityName)}`;
  }
  return `${name}${extension}`;
};

const EXTENSIONS = {
  graphml: '.graphml',
  csv: '.csv',
} as const;

/**
 * Provide the appropriate file extension for the export type
 * @param  {string} formatterType one of the `format`s
 * @return {string}
 */
export const getFileExtension = (formatterType: ExportFormat) => {
  switch (formatterType) {
    case 'graphml':
      return EXTENSIONS.graphml;
    case 'adjacencyMatrix':
    case 'edgeList':
    case 'attributeList':
    case 'ego':
      return EXTENSIONS.csv;
  }
};

/**
 * Generate a filename prefix based on the session in the format:
 * `{caseId}_{sessionId}`
 */
export const getFilePrefix = (session: SessionWithResequencedIDs) =>
  sanitizeFilename(
    `${session.sessionVariables[caseProperty]}_${session.sessionVariables[sessionProperty]}`,
  );

/**
 * Check if an option value is selected in the categorical attribute data.
 * Categorical attributes are stored as arrays of selected option values; an
 * unanswered attribute (null / undefined) has nothing selected.
 *
 * @param attributeData - The categorical attribute value (array of selections)
 * @param optionValue - The option value to check for
 * @returns true if the option is selected, false otherwise
 */
export const isCategoricalOptionSelected = (
  attributeData: unknown,
  optionValue: string | number | boolean,
): boolean =>
  Array.isArray(attributeData) && attributeData.includes(optionValue);

export const getEntityAttributes = (entity: NcEntity) =>
  entity[entityAttributesProperty];

/**
 * Whether an entity's stored value for an attribute is ciphertext: the list of
 * bytes encryption stores, saved with its secure-attribute metadata. The
 * codebook's `encrypted` flag cannot say so, since it describes what the
 * protocol asks for now, which may differ from how this value was saved. Nor
 * can the metadata alone: an older runtime left it in place when a plaintext
 * answer replaced an encrypted one.
 */
export const hasEncryptedValue = (entity: NcEntity, attributeId: string) => {
  const value = entity[entityAttributesProperty][attributeId];
  return (
    entity[entitySecureAttributesMeta]?.[attributeId] !== undefined &&
    Array.isArray(value) &&
    value.every((item) => typeof item === 'number')
  );
};
