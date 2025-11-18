import cx from "classnames";
import type React from "react";

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
							// biome-ignore lint/suspicious/noArrayIndexKey: Static table headers with no unique identifiers
							<th key={`header-col-${m}`}>{column}</th>
						))}
					</tr>
				</thead>
			)}
			<tbody>
				{[...(!rotated ? [...rows.slice(1)] : rows)].map((row, n) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: Static table data with no unique identifiers
					<tr key={`row-${n}`}>
						{row.map((column, m) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: Static table cells with no unique identifiers
							<td key={`col-${m}`}>{column}</td>
						))}
					</tr>
				))}
			</tbody>
		</table>
	);
};

export default MiniTable;
