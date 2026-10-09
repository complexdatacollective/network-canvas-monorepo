type RosterCsvRow = Readonly<{
  /** Where the row sits in a spreadsheet showing the file: the header is row 1. */
  row: number;
  /** How many cells the row holds: more or fewer than `columns` in a malformed row. */
  cells: number;
  values: Readonly<Record<string, string>>;
}>;

type RosterCsv = Readonly<{
  columns: readonly string[];
  rows: readonly RosterCsvRow[];
}>;

const columnName = (header: readonly unknown[], index: number) => {
  const name = header[index];
  return typeof name === 'string' && name !== '' ? name : `field${index + 1}`;
};

const cellText = (cell: unknown) => {
  if (typeof cell !== 'string') {
    throw new TypeError('CSV cells must be text.');
  }
  return cell;
};

/**
 * Reads a CSV roster the way an interview loads it, so a check made on what
 * this returns is a check on what the interview will hold. Architect and the
 * protocol builder read an imported roster with it for the same reason.
 *
 * Reads each row as an array of cells and pairs it with the header here.
 * csvtojson's JSON output builds each row by assigning to a plain object, which
 * silently drops a `__proto__` column and garbles the values of columns called
 * `constructor` or `toString`, and treats a dot in a header as nesting unless
 * `flatKeys` is set. A researcher's variable name may be any text, so a
 * column must keep exactly the name it was given. Values are collected with
 * Object.fromEntries, which defines own properties for the same reason.
 *
 * Mirrors the JSON output otherwise: a blank header is named `field<n>`, an
 * unquoted header loses the spaces round it while a quoted one keeps them, and
 * blank lines are not rows. A blank line still counts towards `row`, as it does
 * in a spreadsheet.
 */
export const readRosterCsv = async (text: string): Promise<RosterCsv> => {
  const { default: csv } = await import('csvtojson');
  const converter = csv({ output: 'csv' }).fromString(text);
  const records: unknown[] = await converter;
  const header: readonly unknown[] = converter.parseRuntime.headers ?? [];

  const rows = records.flatMap((record, index) => {
    if (!Array.isArray(record)) {
      throw new TypeError('CSV rows must be arrays of cells.');
    }

    if (record.length === 0) {
      return [];
    }

    return [
      {
        row: index + 2,
        cells: record.length,
        values: Object.fromEntries(
          record.map((cell: unknown, column) => [
            columnName(header, column),
            cellText(cell),
          ]),
        ),
      },
    ];
  });

  return {
    columns: header.map((_, index) => columnName(header, index)),
    rows,
  };
};
