import { ArrowDown as ArrowDropDownIcon, ArrowUp as ArrowDropUpIcon } from "lucide-react";
import { type Column, useSortBy, useTable } from "react-table";

const getSortIcon = (column: Column<Record<string, unknown>>) => {
	if (!column.isSorted) {
		return null;
	}
	return column.isSortedDesc ? <ArrowDropDownIcon /> : <ArrowDropUpIcon />;
};

type TableProps = {
	data: Record<string, unknown>[];
	columns: Column<Record<string, unknown>>[];
};

const Table = ({ data, columns }: TableProps) => {
	const { getTableProps, getTableBodyProps, headerGroups, rows, prepareRow } = useTable({ data, columns }, useSortBy);

	return (
		<table {...getTableProps()} className="network">
			<thead>
				{headerGroups.map((headerGroup) => (
					<tr {...headerGroup.getHeaderGroupProps()} key={headerGroup.id}>
						{headerGroup.headers.map((column) => (
							<th {...column.getHeaderProps(column.getSortByToggleProps())} key={column.id}>
								{column.render("Header")}
								{getSortIcon(column)}
							</th>
						))}
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
									{cell.render("Cell")}
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
