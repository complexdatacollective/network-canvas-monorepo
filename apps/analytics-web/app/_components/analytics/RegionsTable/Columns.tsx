"use client";
import { ColumnDef } from "@tanstack/react-table";
import { RegionTotal } from "~/utils/getRegionsTotals";
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
