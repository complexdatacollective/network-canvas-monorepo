import type { Variable } from '@codaco/protocol-validation';
import {
  type ExportColumnEntity,
  type ExportColumnOrigin,
  type LayoutColumnAxis,
  neutralizeCsvFormula,
  reservedExportColumns,
  toCanonicalText,
  variableExportColumnEntries,
} from '@codaco/shared-consts';

import type { ExportOptions } from '../../options';
import type { ExportWarning } from '../../output';
import { getOwn, isCategoricalOptionSelected } from '../../utils/general';

type Attributes = Readonly<Record<string, unknown>>;

type ReadCell = (attributes: Attributes) => unknown;

/** A column of a CSV file's variables, and how a row's cell is read. */
type CsvColumn = {
  readonly header: string;
  readonly cell: ReadCell;
};

type CsvColumnContext = Readonly<{
  exportOptions: ExportOptions;
  protocolName: string;
  reportWarning: (warning: ExportWarning) => void;
}>;

type CsvEntityType = Readonly<{
  /** The node or edge type's name. The ego has none. */
  name?: string;
  variables: Readonly<Record<string, Variable>> | undefined;
  /** The attributes of every entity of the type in the file. */
  attributes: readonly Attributes[];
}>;

const layoutCoordinate = (
  data: unknown,
  axis: 'x' | 'y',
): number | undefined => {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return undefined;
  }
  const value: unknown =
    axis === 'x'
      ? 'x' in data
        ? data.x
        : undefined
      : 'y' in data
        ? data.y
        : undefined;
  return typeof value === 'number' ? value : undefined;
};

const layoutCell = (
  data: unknown,
  axis: LayoutColumnAxis,
  { globalOptions }: ExportOptions,
): unknown => {
  const x = layoutCoordinate(data, 'x');
  const y = layoutCoordinate(data, 'y');
  switch (axis) {
    case 'x':
      return x;
    case 'y':
      return y;
    case 'screenSpaceX':
      return x !== undefined && y !== undefined
        ? (x * globalOptions.screenLayoutWidth).toFixed(2)
        : undefined;
    case 'screenSpaceY':
      return x !== undefined && y !== undefined
        ? ((1.0 - y) * globalOptions.screenLayoutHeight).toFixed(2)
        : undefined;
  }
};

// Headers are compared as they are written, so `=a`, written `'=a`, clashes
// with a variable named `'=a`.
const headerKey = (column: string) =>
  toCanonicalText(neutralizeCsvFormula(column));

const variableCell =
  (
    variableId: string,
    variable: Variable,
    origin: ExportColumnOrigin,
    exportOptions: ExportOptions,
  ): ReadCell =>
  (attributes) => {
    if (!Object.hasOwn(attributes, variableId)) return undefined;
    const data = attributes[variableId];
    switch (origin.kind) {
      case 'name':
        return variable.encrypted ? 'ENCRYPTED' : data;
      case 'option':
        return variable.encrypted
          ? 'ENCRYPTED'
          : isCategoricalOptionSelected(data, origin.value);
      case 'layout':
        if (variable.encrypted) {
          return origin.axis === 'x' || origin.axis === 'y'
            ? 'ENCRYPTED'
            : undefined;
        }
        return layoutCell(data, origin.axis, exportOptions);
    }
  };

type Claim = {
  readonly column: string;
  /** The variable, or undeclared attribute, the column belongs to. */
  readonly owner: string;
  readonly cell: ReadCell;
};

/**
 * The variable columns of one entity type: every column each variable is
 * written to, in codebook order, then one for each attribute the codebook
 * does not declare, in the order the entities have them.
 *
 * Two of them, or one of them and a built-in column, can have the same name,
 * compared as written to the file and after NFC normalisation. The built-in column keeps its name, and so
 * does the first of the others; a later one is given the first of `_2`, `_3`,
 * ... that no other column has, and reported. Every column whose name is free
 * takes it before any is renamed, so a renamed column never takes another
 * column's own name.
 */
const planCsvColumns = (
  entity: ExportColumnEntity,
  type: CsvEntityType,
  { exportOptions, protocolName, reportWarning }: CsvColumnContext,
): CsvColumn[] => {
  const claims: Claim[] = [];
  for (const [variableId, variable] of Object.entries(type.variables ?? {})) {
    for (const { column, origin } of variableExportColumnEntries(variable, {
      format: 'csv',
      useScreenLayoutCoordinates:
        exportOptions.globalOptions.useScreenLayoutCoordinates,
    })) {
      claims.push({
        column,
        owner: variable.name,
        cell: variableCell(variableId, variable, origin, exportOptions),
      });
    }
  }

  const undeclared = new Set<string>();
  for (const attributes of type.attributes) {
    for (const attribute of Object.keys(attributes)) {
      if (!getOwn(type.variables, attribute)) undeclared.add(attribute);
    }
  }
  for (const attribute of undeclared) {
    claims.push({
      column: attribute,
      owner: attribute,
      cell: (attributes) => getOwn(attributes, attribute),
    });
  }

  const taken = new Set(reservedExportColumns.csv[entity].map(headerKey));
  const headers = new Map<Claim, string>();
  for (const claim of claims) {
    const key = headerKey(claim.column);
    if (taken.has(key)) continue;
    taken.add(key);
    headers.set(claim, claim.column);
  }
  for (const claim of claims) {
    if (headers.has(claim)) continue;
    let suffix = 2;
    while (taken.has(headerKey(`${claim.column}_${suffix}`))) {
      suffix += 1;
    }
    const renamedTo = `${claim.column}_${suffix}`;
    taken.add(headerKey(renamedTo));
    headers.set(claim, renamedTo);
    reportWarning({
      kind: 'column-renamed',
      protocolName,
      format: 'csv',
      entity,
      ...(type.name === undefined ? {} : { entityTypeName: type.name }),
      variable: claim.owner,
      column: claim.column,
      renamedTo,
    });
  }

  return claims.map((claim) => ({
    header: headers.get(claim) ?? claim.column,
    cell: claim.cell,
  }));
};

/** The ego's variable columns. */
export const planEgoColumns = (
  variables: Readonly<Record<string, Variable>> | undefined,
  attributes: Attributes,
  context: CsvColumnContext,
): CsvColumn[] =>
  planCsvColumns('ego', { variables, attributes: [attributes] }, context);

/** A column of a file of nodes or edges, read for each row by its type. */
type CsvTypedColumn = {
  readonly header: string;
  readonly cells: ReadonlyMap<string, ReadCell>;
};

type TypedEntity = Readonly<{ type: string; attributes: Attributes }>;

/**
 * The variable columns of a file of nodes or of edges. Each type's columns are
 * planned on their own, as its own file would have them, and a column of the
 * same name in two types is shared: no row has both. A file with no rows has
 * the columns of every type in the codebook.
 */
export const planTypedColumns = (
  entity: 'node' | 'edge',
  definitions:
    | Readonly<
        Record<
          string,
          Readonly<{
            name: string;
            variables?: Readonly<Record<string, Variable>>;
          }>
        >
      >
    | undefined,
  entities: readonly TypedEntity[],
  context: CsvColumnContext,
): CsvTypedColumn[] => {
  const attributesByType = new Map<string, Attributes[]>();
  for (const { type, attributes } of entities) {
    const existing = attributesByType.get(type);
    if (existing) {
      existing.push(attributes);
    } else {
      attributesByType.set(type, [attributes]);
    }
  }
  if (attributesByType.size === 0) {
    for (const type of Object.keys(definitions ?? {})) {
      attributesByType.set(type, []);
    }
  }

  const columns = new Map<
    string,
    { header: string; cells: Map<string, ReadCell> }
  >();
  for (const [type, attributes] of attributesByType) {
    const definition = getOwn(definitions, type);
    for (const { header, cell } of planCsvColumns(
      entity,
      {
        name: definition?.name ?? type,
        variables: definition?.variables,
        attributes,
      },
      context,
    )) {
      const key = headerKey(header);
      const existing = columns.get(key);
      if (existing) {
        existing.cells.set(type, cell);
      } else {
        columns.set(key, { header, cells: new Map([[type, cell]]) });
      }
    }
  }
  return [...columns.values()];
};
