import sanitizeFilename from 'sanitize-filename';

import {
  caseProperty,
  type NcEntity,
  entityAttributesProperty,
  sessionProperty,
} from '@codaco/shared-consts';

import type { SessionWithResequencedIDs } from '../input';
import type { ExportFormat } from '../options';

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
 * Looks a researcher-authored key (a variable id or an entity type id) up in a
 * record without reaching `Object.prototype`: `variables['constructor']` is a
 * function, not a missing variable.
 */
export function getOwn<Entries extends Readonly<Record<string, unknown>>>(
  record: Entries | undefined,
  key: string,
): Entries[string] | undefined;
export function getOwn(
  record: Readonly<Record<string, unknown>> | undefined,
  key: string,
): unknown {
  return record !== undefined && Object.hasOwn(record, key)
    ? record[key]
    : undefined;
}
