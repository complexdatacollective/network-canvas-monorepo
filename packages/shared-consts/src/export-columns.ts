import { normalizeForComparison } from './canonical-text.ts';
import {
  appVersionProperty,
  commitHashProperty,
  edgeExportIDProperty,
  egoProperty,
  graphMLLabelKey,
  ncCaseProperty,
  ncFinishOutcomeProperty,
  ncInterviewLocaleProperty,
  ncProtocolNameProperty,
  ncSessionProperty,
  ncSourceUUID,
  ncTargetUUID,
  ncTypeProperty,
  ncUUIDProperty,
  nodeExportIDProperty,
} from './export-process.ts';
import { neutralizeCsvFormula, toGraphMLAttrName } from './export-text.ts';
import {
  edgeSourceProperty,
  edgeTargetProperty,
  entityPrimaryKeyProperty,
} from './network.ts';
import {
  caseProperty,
  protocolName,
  sessionExportTimeProperty,
  sessionFinishTimeProperty,
  sessionProperty,
  sessionStartTimeProperty,
} from './session.ts';

/*
 * A variable's name becomes a CSV column header and a GraphML `attr.name`, and
 * categorical and layout variables expand into several columns named after
 * it. Two variables with different names can therefore still write the same
 * column, and so can two columns that differ only in what a format changes as
 * it writes them (`export-text.ts`). The exporters derive their columns
 * through the functions here, and the editors refuse a name through
 * `findExportColumnConflicts`, which derives and writes them the same way, so
 * the editors refuse exactly what the export would collide on.
 */

export type ExportColumnFormat = 'csv' | 'graphml';

export type ExportColumnEntity = 'ego' | 'node' | 'edge';

type ExportOptionValue = string | number | boolean;

/** The parts of a codebook variable its export columns depend on. */
export type ExportColumnVariable = {
  readonly name: string;
  readonly type: string;
  readonly options?: readonly { readonly value: ExportOptionValue }[];
};

export type LayoutColumnAxis = 'x' | 'y' | 'screenSpaceX' | 'screenSpaceY';

const FORMATS = [
  'csv',
  'graphml',
] as const satisfies readonly ExportColumnFormat[];

const LAYOUT_SUFFIXES = {
  csv: {
    x: 'x',
    y: 'y',
    screenSpaceX: 'screenSpaceX',
    screenSpaceY: 'screenSpaceY',
  },
  graphml: {
    x: 'X',
    y: 'Y',
    screenSpaceX: 'screenSpaceX',
    screenSpaceY: 'screenSpaceY',
  },
} as const satisfies Record<
  ExportColumnFormat,
  Record<LayoutColumnAxis, string>
>;

const NORMALIZED_AXES = [
  'x',
  'y',
] as const satisfies readonly LayoutColumnAxis[];

const SCREEN_SPACE_AXES = [
  'screenSpaceX',
  'screenSpaceY',
] as const satisfies readonly LayoutColumnAxis[];

/**
 * The column one option of a categorical variable is written to, spelled the
 * same in CSV and GraphML. GraphML's key ids are built the same way from the
 * variable's id and a hash of the option value.
 */
export const categoricalOptionColumn = (
  base: string,
  optionValue: ExportOptionValue,
): string => `${base}_${String(optionValue)}`;

/**
 * The column one coordinate of a layout variable is written to. CSV spells the
 * normalized coordinates `_x` and `_y`, GraphML `_X` and `_Y`; the screen-space
 * columns are spelled the same in both.
 */
export const layoutColumn = (
  format: ExportColumnFormat,
  base: string,
  axis: LayoutColumnAxis,
): string => `${base}_${LAYOUT_SUFFIXES[format][axis]}`;

/** What in a variable produces one of its columns. */
export type ExportColumnOrigin =
  | { readonly kind: 'name' }
  | { readonly kind: 'option'; readonly value: ExportOptionValue }
  | { readonly kind: 'layout'; readonly axis: LayoutColumnAxis };

/** One column a variable is written to, and what in the variable produces it. */
export type ExportColumnEntry = {
  readonly column: string;
  readonly origin: ExportColumnOrigin;
};

const columnEntries = (
  format: ExportColumnFormat,
  variable: ExportColumnVariable,
  useScreenLayoutCoordinates: boolean,
): ExportColumnEntry[] => {
  switch (variable.type) {
    case 'categorical':
      return (variable.options ?? []).map(({ value }): ExportColumnEntry => ({
        column: categoricalOptionColumn(variable.name, value),
        origin: { kind: 'option', value },
      }));
    case 'layout':
      return [
        ...NORMALIZED_AXES,
        ...(useScreenLayoutCoordinates ? SCREEN_SPACE_AXES : []),
      ].map((axis): ExportColumnEntry => ({
        column: layoutColumn(format, variable.name, axis),
        origin: { kind: 'layout', axis },
      }));
    default:
      return [{ column: variable.name, origin: { kind: 'name' } }];
  }
};

type ExportColumnOptions = Readonly<{
  format: ExportColumnFormat;
  useScreenLayoutCoordinates: boolean;
}>;

/**
 * Every column a variable is written to, with what in the variable produces
 * each one, in the order the CSV formatters write them. Only categorical and
 * layout variables expand; every other type, ordinal included, is one column
 * named after the variable.
 */
export const variableExportColumnEntries = (
  variable: ExportColumnVariable,
  { format, useScreenLayoutCoordinates }: ExportColumnOptions,
): ExportColumnEntry[] =>
  columnEntries(format, variable, useScreenLayoutCoordinates);

/**
 * The built-in columns each export file writes beside its variable columns.
 *
 * The CSV formatters read a built-in column from an internal property
 * (`_uid`, `caseId`) and print it under another name (`networkCanvasUUID`,
 * `networkCanvasCaseID`). Both spellings are reserved: an export renames a
 * variable column that has either one, and reports it. The interview locale and
 * the finish outcome are the exceptions: only their printed names are
 * reserved, so a variable called `interviewLocale` or `finishOutcome` (valid
 * names in earlier protocols) is exported unchanged.
 *
 * GraphML declares `label`, `networkCanvasType` and `networkCanvasUUID` for
 * every element, the graph (ego) included.
 */
export const reservedExportColumns = {
  csv: {
    ego: [
      entityPrimaryKeyProperty,
      egoProperty,
      caseProperty,
      ncCaseProperty,
      sessionProperty,
      ncSessionProperty,
      protocolName,
      ncProtocolNameProperty,
      sessionStartTimeProperty,
      sessionFinishTimeProperty,
      sessionExportTimeProperty,
      appVersionProperty,
      commitHashProperty,
      ncInterviewLocaleProperty,
      ncFinishOutcomeProperty,
    ],
    node: [
      nodeExportIDProperty,
      egoProperty,
      entityPrimaryKeyProperty,
      ncUUIDProperty,
    ],
    edge: [
      edgeExportIDProperty,
      edgeSourceProperty,
      edgeTargetProperty,
      egoProperty,
      entityPrimaryKeyProperty,
      ncUUIDProperty,
      ncSourceUUID,
      ncTargetUUID,
    ],
  },
  graphml: {
    ego: [graphMLLabelKey, ncTypeProperty, ncUUIDProperty],
    node: [graphMLLabelKey, ncTypeProperty, ncUUIDProperty],
    edge: [
      graphMLLabelKey,
      ncTypeProperty,
      ncUUIDProperty,
      ncSourceUUID,
      ncTargetUUID,
    ],
  },
} as const satisfies Record<
  ExportColumnFormat,
  Record<ExportColumnEntity, readonly string[]>
>;

/**
 * One way a variable's would-be columns clash with what the export already
 * writes. `column` and `origin` describe the candidate's own column; the rest
 * describes what it clashes with: a built-in column, or one of a sibling
 * variable's columns. `formats` are the export formats in which they clash.
 */
export type ExportColumnConflict<
  Sibling extends ExportColumnVariable = ExportColumnVariable,
> =
  | {
      readonly kind: 'reserved';
      readonly column: string;
      readonly origin: ExportColumnOrigin;
      readonly reservedColumn: string;
      readonly formats: readonly ExportColumnFormat[];
    }
  | {
      readonly kind: 'sibling';
      readonly column: string;
      readonly origin: ExportColumnOrigin;
      readonly sibling: Sibling;
      readonly siblingColumn: string;
      readonly siblingOrigin: ExportColumnOrigin;
      readonly formats: readonly ExportColumnFormat[];
      /**
       * Set when `column` and `siblingColumn` are different text that a format
       * writes the same way, such as GraphML's `close friend` and
       * `close_friend`: the column as that format writes it.
       */
      readonly writtenColumn?: string;
    };

const writtenColumn = (format: ExportColumnFormat, column: string): string =>
  format === 'csv' ? neutralizeCsvFormula(column) : toGraphMLAttrName(column);

type ComparableEntry = ExportColumnEntry & { readonly key: string };

const originKey = (origin: ExportColumnOrigin): string => {
  switch (origin.kind) {
    case 'name':
      return 'name';
    case 'option':
      return `option:${typeof origin.value}:${String(origin.value)}`;
    case 'layout':
      return `layout:${origin.axis}`;
  }
};

// Screen-space columns included: a name is chosen long before anyone picks
// the options it will be exported with.
const comparableEntries = (
  format: ExportColumnFormat,
  variable: ExportColumnVariable,
): ComparableEntry[] =>
  columnEntries(format, variable, true).map((entry) => ({
    ...entry,
    key: normalizeForComparison(writtenColumn(format, entry.column)),
  }));

const reservedColumnsFor = (
  format: ExportColumnFormat,
  entity: ExportColumnEntity,
): Map<string, string> => {
  const reserved = new Map<string, string>();
  for (const column of reservedExportColumns[format][entity]) {
    const key = normalizeForComparison(writtenColumn(format, column));
    if (!reserved.has(key)) reserved.set(key, column);
  }
  return reserved;
};

/**
 * Every export column `candidate` would write that a built-in column or one of
 * `siblings` already writes, in any export format.
 *
 * `candidate` is the variable as it would be saved: its name, type and
 * options. `siblings` are the other variables of the same node or edge type,
 * or the other ego variables, never the candidate itself. The check is
 * symmetric, so a rename, a new option and a new variable are all judged by
 * the same call.
 *
 * Each format's columns are compared as that format writes them, and only
 * with that format's columns: a CSV header never shares a file with a GraphML
 * attribute. Written columns are compared with `normalizeForComparison`, the
 * comparison the editors' duplicate-name check makes. A clash found in both
 * formats is reported once, with both formats. A sibling whose name is the
 * candidate's own is skipped: that is a duplicate name, which the editors
 * already refuse with their own message.
 */
export const findExportColumnConflicts = <
  Sibling extends ExportColumnVariable,
>({
  entity,
  candidate,
  siblings,
}: Readonly<{
  entity: ExportColumnEntity;
  candidate: ExportColumnVariable;
  siblings: readonly Sibling[];
}>): ExportColumnConflict<Sibling>[] => {
  const candidateName = normalizeForComparison(candidate.name);
  const others = siblings.filter(
    (sibling) => normalizeForComparison(sibling.name) !== candidateName,
  );

  // Keyed by the two columns as text, so the same clash found in a second
  // format adds that format rather than a second conflict.
  const found = new Map<
    string,
    {
      readonly conflict: ExportColumnConflict<Sibling>;
      readonly formats: ExportColumnFormat[];
    }
  >();
  const record = (
    identity: readonly (string | number)[],
    format: ExportColumnFormat,
    conflict: (formats: ExportColumnFormat[]) => ExportColumnConflict<Sibling>,
  ) => {
    const key = JSON.stringify(identity);
    const existing = found.get(key);
    if (existing) {
      existing.formats.push(format);
      return;
    }
    const formats = [format];
    found.set(key, { conflict: conflict(formats), formats });
  };

  for (const format of FORMATS) {
    const reserved = reservedColumnsFor(format, entity);
    const siblingEntries = others.map((sibling, index) => ({
      sibling,
      index,
      entries: comparableEntries(format, sibling),
    }));
    for (const { column, origin, key } of comparableEntries(
      format,
      candidate,
    )) {
      const ownColumn = normalizeForComparison(column);
      const reservedColumn = reserved.get(key);
      if (reservedColumn !== undefined) {
        record(
          [
            'reserved',
            ownColumn,
            originKey(origin),
            normalizeForComparison(reservedColumn),
          ],
          format,
          (formats) => ({
            kind: 'reserved',
            column,
            origin,
            reservedColumn,
            formats,
          }),
        );
      }
      for (const { sibling, index, entries } of siblingEntries) {
        for (const entry of entries) {
          if (entry.key !== key) continue;
          const siblingColumn = normalizeForComparison(entry.column);
          record(
            [
              'sibling',
              ownColumn,
              originKey(origin),
              index,
              siblingColumn,
              originKey(entry.origin),
            ],
            format,
            (formats) => ({
              kind: 'sibling',
              column,
              origin,
              sibling,
              siblingColumn: entry.column,
              siblingOrigin: entry.origin,
              formats,
              ...(siblingColumn === ownColumn
                ? {}
                : { writtenColumn: writtenColumn(format, column) }),
            }),
          );
        }
      }
    }
  }
  return [...found.values()].map(({ conflict }) => conflict);
};
