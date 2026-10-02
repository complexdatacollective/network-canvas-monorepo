import { defineMessages, type IntlShape } from '@codaco/app-i18n/messages';
import {
  type ExportColumnConflict,
  type ExportColumnEntity,
  type ExportColumnOrigin,
  type ExportColumnVariable,
  findExportColumnConflicts,
  normalizeCodebookName,
} from '@codaco/shared-consts';

// One message for each of the candidate's own columns that can clash, each
// naming what it clashes with. `clashesWith` is `reserved`, `option`,
// `layout`, or (as `other`) the plain name of another attribute. A layout
// attribute's columns cannot clash with another layout attribute's, which are
// named after a different attribute, so that message has no `layout` branch.
const messages = defineMessages({
  nameColumn: {
    id: 'architect.exportColumnConflict.nameColumn',
    defaultMessage:
      '{clashesWith, select, reserved {Exported data already includes a built-in column named “{reservedColumn}”, so an attribute can’t use this name.} option {Exported data already includes the column “{siblingColumn}” for the option “{siblingOption}” of the attribute “{sibling}”, so an attribute can’t use this name.} layout {Exported data already includes the column “{siblingColumn}” for the position of the layout attribute “{sibling}”, so an attribute can’t use this name.} other {Exported data already includes the column “{siblingColumn}” for the attribute “{sibling}”, so an attribute can’t use this name.}}',
    description:
      'Validation error below the field where a researcher names an attribute: exported data (CSV and GraphML files) would get two columns with the same name. Text inside curly quotes is a name the researcher typed or a fixed column name; keep it exactly as given. A layout attribute stores a position on a canvas, which is exported as one column for each coordinate.',
  },
  optionColumn: {
    id: 'architect.exportColumnConflict.optionColumn',
    defaultMessage:
      '{clashesWith, select, reserved {The option “{optionValue}” would be exported to a column named “{column}”, which is a built-in column in exported data. Change the option’s value or the attribute’s name.} option {The option “{optionValue}” would be exported to the column “{column}”, which the option “{siblingOption}” of the attribute “{sibling}” already uses. Change the option’s value or the attribute’s name.} layout {The option “{optionValue}” would be exported to the column “{column}”, which the layout attribute “{sibling}” already uses for its position. Change the option’s value or the attribute’s name.} other {The option “{optionValue}” would be exported to the column “{column}”, which the attribute “{sibling}” already uses. Change the option’s value or the attribute’s name.}}',
    description:
      'Validation error below the list of options of a categorical attribute: exported data (CSV and GraphML files) has a column for each option, and this option’s column would have the same name as another column. Text inside curly quotes is a name or value the researcher typed or a fixed column name; keep it exactly as given. A layout attribute stores a position on a canvas, which is exported as one column for each coordinate.',
  },
  layoutColumn: {
    id: 'architect.exportColumnConflict.layoutColumn',
    defaultMessage:
      '{clashesWith, select, reserved {A layout attribute is exported as one column for each coordinate, and the column “{column}” is a built-in column in exported data. Choose a different name.} option {A layout attribute is exported as one column for each coordinate, and the column “{column}” is already used by the option “{siblingOption}” of the attribute “{sibling}”. Choose a different name.} other {A layout attribute is exported as one column for each coordinate, and the column “{column}” is already used by the attribute “{sibling}”. Choose a different name.}}',
    description:
      'Validation error below the field where a researcher names a layout attribute, which stores a position on a canvas: exported data (CSV and GraphML files) has one column for each coordinate, and one of them would have the same name as another column. Text inside curly quotes is a name the researcher typed or a fixed column name; keep it exactly as given.',
  },
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Options as they will be saved: string values normalized, and rows without a
// value left out (an unfinished row is the options list's own complaint).
const readOptions = (
  options: unknown,
): { value: string | number | boolean }[] =>
  Array.isArray(options)
    ? options.flatMap((option): { value: string | number | boolean }[] => {
        const value = isRecord(option) ? option.value : undefined;
        if (typeof value === 'string') {
          const normalized = normalizeCodebookName(value);
          return normalized === '' ? [] : [{ value: normalized }];
        }
        if (typeof value === 'number' || typeof value === 'boolean') {
          return [{ value }];
        }
        return [];
      })
    : [];

/**
 * A variable as it would be saved, read from form values that are not yet
 * typed. Undefined while there is nothing to judge: no name yet, or no type
 * chosen to say which columns the name expands to.
 */
export const toExportColumnCandidate = ({
  name,
  type,
  options,
}: Readonly<{
  name: unknown;
  type: unknown;
  options: unknown;
}>): ExportColumnVariable | undefined => {
  if (typeof name !== 'string' || typeof type !== 'string' || type === '') {
    return undefined;
  }
  const normalizedName = normalizeCodebookName(name);
  if (normalizedName === '') return undefined;
  return { name: normalizedName, type, options: readOptions(options) };
};

const exportColumnConflictMessage = (
  conflict: ExportColumnConflict,
  intl: IntlShape,
): string => {
  const { origin } = conflict;
  const siblingConflict = conflict.kind === 'sibling' ? conflict : undefined;
  const values = {
    clashesWith: siblingConflict
      ? siblingConflict.siblingOrigin.kind
      : 'reserved',
    column: conflict.column,
    optionValue: origin.kind === 'option' ? String(origin.value) : '',
    reservedColumn: conflict.kind === 'reserved' ? conflict.reservedColumn : '',
    sibling: siblingConflict ? siblingConflict.sibling.name : '',
    siblingColumn: siblingConflict ? siblingConflict.siblingColumn : '',
    siblingOption:
      siblingConflict?.siblingOrigin.kind === 'option'
        ? String(siblingConflict.siblingOrigin.value)
        : '',
  };

  switch (origin.kind) {
    case 'option':
      return intl.formatMessage(messages.optionColumn, values);
    case 'layout':
      return intl.formatMessage(messages.layoutColumn, values);
    case 'name':
      return intl.formatMessage(messages.nameColumn, values);
  }
};

/**
 * Why `candidate` cannot be saved: the first of its export columns that
 * clashes with a built-in column or a column of one of `siblings` (the other
 * variables of the same node type, edge type or ego), as a whole message.
 *
 * `origins` limits which of the candidate's own columns are reported, for a
 * form whose fields each answer for a part of the variable: the name field for
 * its name and layout columns, the options field for its option columns, so
 * one clash is never shown twice.
 */
export const findExportColumnConflictMessage = ({
  entity,
  candidate,
  siblings,
  origins,
  intl,
}: Readonly<{
  entity: ExportColumnEntity;
  candidate: ExportColumnVariable | undefined;
  siblings: readonly ExportColumnVariable[];
  origins?: readonly ExportColumnOrigin['kind'][];
  intl: IntlShape;
}>): string | undefined => {
  if (!candidate) return undefined;

  const conflict = findExportColumnConflicts({
    entity,
    candidate,
    siblings,
  }).find(({ origin }) => !origins || origins.includes(origin.kind));

  return conflict && exportColumnConflictMessage(conflict, intl);
};
