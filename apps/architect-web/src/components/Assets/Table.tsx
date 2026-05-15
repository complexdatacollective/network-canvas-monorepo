import {
  ArrowDown as ArrowDropDownIcon,
  ArrowUp as ArrowDropUpIcon,
} from 'lucide-react';
import {
  type Column,
  type TableHeaderProps,
  useSortBy,
  useTable,
} from 'react-table';

import { cx } from '~/utils/cva';

// Type for column with sort properties added by useSortBy
type ColumnWithSort = Column<Record<string, unknown>> & {
  isSorted?: boolean;
  isSortedDesc?: boolean;
  getSortByToggleProps?: () => TableHeaderProps;
};

const getSortIcon = (column: ColumnWithSort) => {
  if (!column.isSorted) {
    return null;
  }
  return column.isSortedDesc ? <ArrowDropDownIcon /> : <ArrowDropUpIcon />;
};

type TableProps = {
  data: Record<string, unknown>[];
  columns: Column<Record<string, unknown>>[];
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
  const { getTableProps, getTableBodyProps, headerGroups, rows, prepareRow } =
    useTable({ data, columns }, useSortBy);

  return (
    <table {...getTableProps()} className={tableClasses}>
      <thead>
        {headerGroups.map((headerGroup) => (
          <tr {...headerGroup.getHeaderGroupProps()} key={headerGroup.id}>
            {headerGroup.headers.map((column) => {
              const sortableColumn = column as ColumnWithSort;
              return (
                <th
                  {...column.getHeaderProps(
                    sortableColumn.getSortByToggleProps
                      ? sortableColumn.getSortByToggleProps()
                      : undefined,
                  )}
                  key={column.id}
                >
                  {column.render('Header')}
                  {getSortIcon(sortableColumn)}
                </th>
              );
            })}
          </tr>
        ))}
      </thead>
      <tbody {...getTableBodyProps()}>
        {rows.map((row) => {
          prepareRow(row);

          return (
            <tr {...row.getRowProps()} key={row.id}>
              {row.cells.map((cell) => (
                <td {...cell.getCellProps()} key={cell.column.id}>
                  {cell.render('Cell')}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};

export default Table;
