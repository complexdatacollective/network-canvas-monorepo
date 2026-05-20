import {
  ArrowDown as ArrowDropDownIcon,
  ArrowUp as ArrowDropUpIcon,
} from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';

import { cx } from '~/utils/cva';

export type TableColumn = {
  Header: string;
  accessor: string;
};

type SortState = {
  id: string;
  desc: boolean;
};

// Ported verbatim from react-table v7's default `alphanumeric` sortType:
// stringifies values, splits on number groups, and compares numerically
// where possible. Handles numbers, mixed alphanumeric, null/undefined.
const reSplitAlphaNumeric = /([0-9]+)/gm;

const toComparableString = (value: unknown): string => {
  if (typeof value === 'number') {
    if (Number.isNaN(value) || value === Infinity || value === -Infinity) {
      return '';
    }
    return String(value);
  }
  if (typeof value === 'string') {
    return value;
  }
  // Everything else (booleans, null, undefined, objects) compares as the empty
  // string, matching react-table v7's `toString` helper.
  return '';
};

const alphanumericCompare = (rawA: unknown, rawB: unknown): number => {
  let a = toComparableString(rawA).split(reSplitAlphaNumeric).filter(Boolean);
  let b = toComparableString(rawB).split(reSplitAlphaNumeric).filter(Boolean);

  while (a.length && b.length) {
    const aa = a.shift()!;
    const bb = b.shift()!;
    const an = parseInt(aa, 10);
    const bn = parseInt(bb, 10);
    const aIsNaN = Number.isNaN(an);
    const bIsNaN = Number.isNaN(bn);

    // Both are strings
    if (aIsNaN && bIsNaN) {
      if (aa > bb) {
        return 1;
      }
      if (bb > aa) {
        return -1;
      }
      continue;
    }

    // One is a string, one is a number (numbers sort before strings)
    if (aIsNaN || bIsNaN) {
      return aIsNaN ? -1 : 1;
    }

    // Both are numbers
    if (an > bn) {
      return 1;
    }
    if (bn > an) {
      return -1;
    }
  }

  return a.length - b.length;
};

// Matches how react-table v7's default cell renderer hands the raw value to
// React: strings/numbers render as text; booleans, null, and undefined render
// as nothing. Non-primitive values (which React would otherwise reject) are
// stringified defensively.
const renderCellValue = (value: unknown): ReactNode => {
  if (typeof value === 'string' || typeof value === 'number') {
    return value;
  }
  if (value === null || value === undefined || typeof value === 'boolean') {
    return null;
  }
  if (Array.isArray(value)) {
    return value.join('');
  }
  return String(value);
};

const getSortIcon = (column: TableColumn, sort: SortState | null) => {
  if (!sort || sort.id !== column.accessor) {
    return null;
  }
  return sort.desc ? <ArrowDropDownIcon /> : <ArrowDropUpIcon />;
};

type TableProps = {
  data: Record<string, unknown>[];
  columns: TableColumn[];
};

const tableClasses = cx(
  'bg-table-row-tint max-h-[60vh] overflow-auto rounded',
  '[&_td]:min-w-32 [&_th]:min-w-32',
  '[&_th]:text-sm [&_th]:font-semibold [&_th]:tracking-wider [&_th]:break-keep [&_th]:whitespace-nowrap [&_th]:uppercase',
  '[&_th]:px-(--space-md) [&_th]:py-(--space-sm) [&_th]:leading-(--space-xl)',
  '[&_th_svg]:text-primary [&_th_svg]:relative [&_th_svg]:top-[-0.1rem] [&_th_svg]:size-(--space-xl) [&_th_svg]:align-middle',
  '[&_th:not(:last-child)]:border-r-[3px] [&_th:not(:last-child)]:border-r-white',
  '[&_td]:p-(--space-md)',
  '[&_td:not(:last-child)]:border-r-[3px] [&_td:not(:last-child)]:border-r-white',
  '[&_tbody>tr:nth-child(odd)>td]:bg-table-row-tint',
);

const Table = ({ data, columns }: TableProps) => {
  const [sort, setSort] = useState<SortState | null>(null);

  // Replicates react-table v7's 3-state toggle cycle with sortDescFirst=false
  // and sort removal enabled: unsorted -> asc -> desc -> unsorted.
  const toggleSort = (id: string) => {
    setSort((current) => {
      if (!current || current.id !== id) {
        return { id, desc: false };
      }
      if (!current.desc) {
        return { id, desc: true };
      }
      return null;
    });
  };

  const sortedRows = useMemo(() => {
    if (!sort) {
      return data;
    }
    const direction = sort.desc ? -1 : 1;
    return data.toSorted(
      (rowA, rowB) =>
        direction * alphanumericCompare(rowA[sort.id], rowB[sort.id]),
    );
  }, [data, sort]);

  return (
    <table className={tableClasses}>
      <thead>
        <tr>
          {columns.map((column) => (
            <th
              key={column.accessor}
              onClick={() => toggleSort(column.accessor)}
              style={{ cursor: 'pointer' }}
              title="Toggle SortBy"
            >
              {column.Header}
              {getSortIcon(column, sort)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sortedRows.map((row, rowIndex) => (
          // eslint-disable-next-line react/no-array-index-key
          <tr key={rowIndex}>
            {columns.map((column) => (
              <td key={column.accessor}>
                {renderCellValue(row[column.accessor])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default Table;
