import type React from "react";
import { cva } from "~/utils/cva";

type MiniTableProps = {
	rows?: React.ReactNode[][];
	wide?: boolean;
	lite?: boolean;
	rotated?: boolean;
	className?: string;
};

const tableVariants = cva({
	base: "mini-table",
	variants: {
		wide: { true: "mini-table-wide" },
		lite: { true: "mini-table-lite" },
		rotated: { true: "mini-table-rotated" },
	},
});

const MiniTable = ({ rows = [], wide = false, lite = false, rotated = false, className }: MiniTableProps) => {
	return (
		<table className={tableVariants({ wide, lite, rotated, class: className })}>
			{!rotated && rows.length > 0 && (
				<thead>
					<tr key="0">
						{rows[0]?.map((column, m) => (
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
