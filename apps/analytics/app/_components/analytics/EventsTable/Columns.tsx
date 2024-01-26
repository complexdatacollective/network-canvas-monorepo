"use client";

import { ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "~/components/DataTable/column-header";
import { MetadataDialog } from "~/components/MetadataDialog";
import type { Event } from "~/db/getEvents";
import { StackTraceDialog } from "./StackTraceDialog";

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
    cell: ({ row }) => {
      return (
        <div className="break-all">{row.original.timestamp.toUTCString()}</div>
      );
    },
  },
  {
    accessorKey: "installationId",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Installation Id" />
    ),
    cell: ({ row }) => {
      return <div className="break-all">{row.original.installationId}</div>;
    },
  },
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
    accessorKey: "stack",
    header: "",
    cell: ({ row }) =>
      row.original.stack && (
        <div className="min-w-max">
          <StackTraceDialog error={row.original} />
        </div>
      ),
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
