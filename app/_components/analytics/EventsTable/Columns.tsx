"use client";
import { DataTableColumnHeader } from "@/components/DataTable/column-header";
import { ColumnDef } from "@tanstack/react-table";
import type { Event } from "@/db/types";
export const columns: ColumnDef<Event>[] = [
  {
    accessorKey: "event",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Event" />
    ),
  },
  {
    accessorKey: "timestamp",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Timestamp" />
    ),
  },
  {
    accessorKey: "installationid",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Installation Id" />
    ),
  },
];
