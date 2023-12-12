"use client";
import { DataTableColumnHeader } from "~/components/DataTable/column-header";
import { Badge } from "~/components/ui/badge";
import { ColumnDef } from "@tanstack/react-table";
import type { ErrorPayload as Error } from "@codaco/analytics";
import { StackTraceDialog } from "~/app/errors/_components/ErrorsTable/StackTraceDialog";
export const columns: ColumnDef<Error>[] = [
  {
    accessorKey: "code",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Code" />
    ),
    cell: ({ row }) => {
      return <Badge variant="secondary">{row.original.code}</Badge>;
    },
  },
  {
    accessorKey: "message",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Message" />
    ),
  },
  {
    accessorKey: "details",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Details" />
    ),
  },
  {
    accessorKey: "path",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Path" />
    ),
  },
  {
    accessorKey: "installationid",
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
    accessorKey: "stacktrace",
    header: "",
    cell: ({ row }) => {
      return (
        <div className="min-w-max">
          <StackTraceDialog error={row.original} />
        </div>
      );
    },
  },
];
