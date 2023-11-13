"use client";
import { DataTableColumnHeader } from "@/components/DataTable/column-header";
import { ColumnDef } from "@tanstack/react-table";
import type { EventPayload as Event } from "@codaco/analytics";
import { MetadataDialog } from "./MetadataDialog";
export const columns: ColumnDef<Event>[] = [
  {
    accessorKey: "type",
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
  {
    accessorKey: "stacktrace",
    header: "",
    cell: ({ row }) => {
      return (
        <div className="min-w-max">
          <MetadataDialog event={row.original} />
        </div>
      );
    },
  },
];
