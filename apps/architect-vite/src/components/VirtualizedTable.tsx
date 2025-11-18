/* eslint-disable react/jsx-props-no-spreading */
import { useCallback } from "react";
import { type Column, useBlockLayout, useTable } from "react-table";
import AutoSizer from "react-virtualized-auto-sizer";
import { FixedSizeList } from "react-window";

type VirtualizedTableProps = {
	columns: Column<Record<string, any>>[];
	data: Record<string, any>[];
};

const VirtualizedTable = ({ columns, data }: VirtualizedTableProps) => {
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
		({ index, style }: { index: number; style: React.CSSProperties }) => {
			const row = rows[index];

			prepareRow(row);

			return (
				<div
					// eslint-disable-next-line react/jsx-props-no-spreading
					{...row.getRowProps({
						style,
					})}
					className="tr"
				>
					{row.cells.map((cell) => (
						// eslint-disable-next-line react/jsx-props-no-spreading
						<div {...cell.getCellProps()} className="td" key={cell.column.id}>
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
			{({ height }: { height: number }) => (
				// eslint-disable-next-line react/jsx-props-no-spreading
				<div {...getTableProps()} className="table">
					<div>
						{headerGroups.map((headerGroup, groupIndex) => (
							// eslint-disable-next-line react/jsx-props-no-spreading
							<div {...headerGroup.getHeaderGroupProps()} className="tr" key={groupIndex}>
								{headerGroup.headers.map((column) => (
									// eslint-disable-next-line react/jsx-props-no-spreading
									<div {...column.getHeaderProps()} className="th" key={column.id}>
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

export default VirtualizedTable;
