"use client";
import type { ColumnDef } from "@tanstack/react-table";
import type { RegionTotal } from "~/utils/getRegionsTotals";
export const columns: ColumnDef<RegionTotal>[] = [
	{
		accessorKey: "country",
		header: "Country",
	},
	{
		accessorKey: "total",
		header: "Total",
	},
];
