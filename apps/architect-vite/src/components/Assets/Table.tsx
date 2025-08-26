import { ArrowDown as ArrowDropDownIcon, ArrowUp as ArrowDropUpIcon } from "lucide-react";
import { useSortBy, useTable } from "react-table";

const getSortIcon = (column) => {
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
					<tr key={headerGroup.id} {...headerGroup.getHeaderGroupProps()}>
						{headerGroup.headers.map((column) => (
							<th key={column.id} {...column.getHeaderProps(column.getSortByToggleProps())}>
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
						<tr key={row.id} {...row.getRowProps()}>
							{row.cells.map((cell) => (
								<td key={cell.column.id} {...cell.getCellProps()}>
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
