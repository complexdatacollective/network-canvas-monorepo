"use client";
import { DataTableColumnHeader } from "@/components/DataTable/column-header";
import { ColumnDef } from "@tanstack/react-table";

export type Error = {
  code: number;
  message: string;
  details: string;
  stacktrace: string;
  installationid: string;
  path: string;
};

export const columns: ColumnDef<Error>[] = [
  {
    accessorKey: "code",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Code" />
    ),
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
    accessorKey: "stacktrace",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Stack Trace" />
    ),
  },
  {
    accessorKey: "installationid",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Installation Id" />
    ),
  },
  {
    accessorKey: "path",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Path" />
    ),
  },
];
