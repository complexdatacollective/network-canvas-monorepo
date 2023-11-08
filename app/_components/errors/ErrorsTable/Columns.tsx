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
    header: "Code",
    accessorKey: "code",
  },
  {
    header: "Message",
    accessorKey: "message",
  },
  {
    header: "Details",
    accessorKey: "details",
  },
  {
    header: "Stack Trace",
    accessorKey: "stacktrace",
  },
  {
    header: "Installation ID",
    accessorKey: "installationid",
  },
  {
    header: "Path",
    accessorKey: "path",
  },
];
