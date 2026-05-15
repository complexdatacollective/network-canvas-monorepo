import type React from "react";
import { cva } from "~/utils/cva";

type MiniTableProps = {
	rows?: React.ReactNode[][];
	wide?: boolean;
	rotated?: boolean;
	className?: string;
};

const tableVariants = cva({
	base: [
		"rounded my-(--space-md) overflow-hidden break-inside-avoid bg-table-row-tint",
		"[&>thead>tr>th]:uppercase [&>thead>tr>th]:font-semibold [&>thead>tr>th]:text-xs [&>thead>tr>th]:tracking-widest [&>thead>tr>th]:break-keep",
		"[&_:is(td,th)]:px-(--space-md) [&_:is(td,th)]:py-(--space-sm)",
		"[&_:is(td,th)_:is(ul,ol)]:[padding:inherit]",
		"[&_:is(td,th)>p:first-child]:mt-0 [&_:is(td,th)>p:last-child]:mb-0",
		"[&_tr>:is(td,th):not(:last-child)]:border-r-[3px] [&_tr>:is(td,th):not(:last-child)]:border-r-white",
		"[&>tbody>tr:nth-child(odd)>td]:bg-table-row-tint",
	],
	variants: {
		wide: { true: "w-full" },
		rotated: {
			true: [
				"[&_tr>:is(td,th):not(:last-child)]:border-r-0",
				"[&>tbody>tr:not(:last-child)>td]:border-b-[3px] [&>tbody>tr:not(:last-child)>td]:border-b-white",
				"[&>tbody>tr:nth-child(odd)>td]:bg-transparent",
				"[&>tbody>tr>td:nth-child(2n)]:bg-table-row-tint",
				"[&>tbody>tr>td:first-child]:uppercase [&>tbody>tr>td:first-child]:font-semibold [&>tbody>tr>td:first-child]:text-xs [&>tbody>tr>td:first-child]:tracking-widest [&>tbody>tr>td:first-child]:text-right [&>tbody>tr>td:first-child]:whitespace-nowrap [&>tbody>tr>td:first-child]:break-words",
			],
		},
	},
});

const MiniTable = ({ rows = [], wide = false, rotated = false, className }: MiniTableProps) => {
	return (
		<table className={tableVariants({ wide, rotated, class: className })}>
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
				{[...(!rotated ? rows.slice(1) : rows)].map((row, n) => (
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
