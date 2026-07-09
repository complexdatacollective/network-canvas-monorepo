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

// Natural sort, so "item2" sorts before "item10".
const collator = new Intl.Collator(undefined, { numeric: true });

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
  '[&_th]:px-5 [&_th]:py-2.5 [&_th]:leading-10',
  '[&_th_svg]:text-action [&_th_svg]:size-4',
  '[&_th:not(:last-child)]:border-r-[3px] [&_th:not(:last-child)]:border-r-white',
  '[&_td]:p-5',
  '[&_td:not(:last-child)]:border-r-[3px] [&_td:not(:last-child)]:border-r-white',
  '[&_tbody>tr:nth-child(odd)>td]:bg-table-row-tint',
);

const Table = ({ data, columns }: TableProps) => {
  const [sort, setSort] = useState<SortState | null>(null);

  // Cycle: unsorted -> asc -> desc -> unsorted.
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
        direction *
        collator.compare(
          String(rowA[sort.id] ?? ''),
          String(rowB[sort.id] ?? ''),
        ),
    );
  }, [data, sort]);

  return (
    <table className={tableClasses}>
      <thead>
        <tr>
          {columns.map((column) => (
            <th
              key={column.accessor}
              aria-sort={
                sort?.id === column.accessor
                  ? sort.desc
                    ? 'descending'
                    : 'ascending'
                  : 'none'
              }
              tabIndex={0}
              onClick={() => toggleSort(column.accessor)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  toggleSort(column.accessor);
                }
              }}
              style={{ cursor: 'pointer' }}
              title="Toggle SortBy"
            >
              <span className="inline-flex items-center gap-1">
                {column.Header}
                {getSortIcon(column, sort)}
              </span>
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
