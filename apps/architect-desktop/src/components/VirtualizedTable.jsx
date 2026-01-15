import PropTypes from "prop-types";
import { useCallback } from "react";
import { useBlockLayout, useTable } from "react-table";
import AutoSizer from "react-virtualized-auto-sizer";
import { FixedSizeList } from "react-window";

const VirtualizedTable = ({ columns, data }) => {
	// Use the state and functions returned from useTable to build your UI
	const { getTableProps, getTableBodyProps, headerGroups, rows, totalColumnsWidth, prepareRow } = useTable(
		{
			columns,
			data,
			// defaultColumn,
		},
		useBlockLayout,
	);

	const RenderRow = useCallback(
		({ index, style }) => {
			const row = rows[index];

			prepareRow(row);

			return (
				<div
					{...row.getRowProps({
						style,
					})}
					className="tr"
				>
					{row.cells.map((cell) => (
						<div {...cell.getCellProps()} className="td">
							{cell.render("Cell")}
						</div>
					))}
				</div>
			);
		},
		[prepareRow, rows],
	);

	// Render the UI for your table
	return (
		<AutoSizer>
			{({ height }) => (
				<div {...getTableProps()} className="table">
					<div>
						{headerGroups.map((headerGroup) => (
							<div {...headerGroup.getHeaderGroupProps()} className="tr">
								{headerGroup.headers.map((column) => (
									<div {...column.getHeaderProps()} className="th">
										{column.render("Header")}
									</div>
								))}
							</div>
						))}
					</div>
					<div {...getTableBodyProps()}>
						<FixedSizeList height={height} itemCount={rows.length} itemSize={150} width={totalColumnsWidth}>
							{RenderRow}
						</FixedSizeList>
					</div>
				</div>
			)}
		</AutoSizer>
	);
};

VirtualizedTable.propTypes = {
	columns: PropTypes.arrayOf(PropTypes.object).isRequired,
	data: PropTypes.arrayOf(PropTypes.object).isRequired,
};

export default VirtualizedTable;
