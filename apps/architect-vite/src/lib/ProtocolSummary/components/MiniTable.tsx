import cx from "classnames";
import React from "react";

type MiniTableProps = {
	rows?: React.ReactNode[][];
	wide?: boolean;
	lite?: boolean;
	rotated?: boolean;
};

const MiniTable = ({ rows = [], wide = false, lite = false, rotated = false }: MiniTableProps) => {
	const classes = cx(
		"protocol-summary-mini-table",
		{ "protocol-summary-mini-table--wide": wide },
		{ "protocol-summary-mini-table--rotated": rotated },
		{ "protocol-summary-mini-table--lite": lite },
	);

	return (
		<table className={classes}>
			{!rotated && (
				<thead>
					<tr key="0">
						{rows[0].map((column, m) => (
							<th key={m}>{column}</th>
						))}
					</tr>
				</thead>
			)}
			<tbody>
				{[...(!rotated ? [...rows.slice(1)] : rows)].map((row, n) => (
					<tr key={n}>
						{row.map((column, m) => (
							<td key={m}>{column}</td>
						))}
					</tr>
				))}
			</tbody>
		</table>
	);
};


export default MiniTable;
