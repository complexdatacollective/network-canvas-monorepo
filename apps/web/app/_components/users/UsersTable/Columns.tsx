"use client";
import { ColumnDef } from "@tanstack/react-table";
import VerifyUserSwitch from "./VerifyUserSwitch";
export const columns: ColumnDef<any>[] = [
  {
    accessorKey: "user",
    header: "User",
    cell: ({ row }) => {
      return (
        <div className={row.original.verified ? "" : "text-muted-foreground"}>
          <div className="font-bold text-md">{row.original.fullName}</div>
          <div className="text-sm text-gray-500">{row.original.username}</div>
        </div>
      );
    },
  },
  {
    accessorKey: "verified",
    header: "Verified",
    cell: ({ row }) => {
      return (
        <VerifyUserSwitch
          id={row.original.id}
          verified={row.original.verified}
        />
      );
    },
  },
];
