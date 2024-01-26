"use client";

import { ColumnDef } from "@tanstack/react-table";
import { StackTraceDialog } from "~/app/_components/errors/ErrorsTable/StackTraceDialog";
import { DataTableColumnHeader } from "~/components/DataTable/column-header";
import { MetadataDialog } from "~/components/MetadataDialog";
import { type ErrorEvent } from "~/db/getErrors";

export const columns: ColumnDef<ErrorEvent>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Name" />
    ),
  },
  {
    accessorKey: "message",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Message" />
    ),
  },
  {
    accessorKey: "installationId",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Installation Id" />
    ),
  },
  {
    accessorKey: "timestamp",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Timestamp" />
    ),
  },
  {
    accessorKey: "stack",
    header: "",
    cell: ({ row }) => {
      return (
        <div className="min-w-max">
          <StackTraceDialog error={row.original} />
        </div>
      );
    },
  },
  {
    accessorKey: "metadata",
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
