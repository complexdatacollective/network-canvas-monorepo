"use client";
import { ColumnDef } from "@tanstack/react-table";
import { UserCircle } from "lucide-react";
export const columns: ColumnDef<any>[] = [
  {
    accessorKey: "user",
    header: "User",
    cell: ({ row }) => {
      return (
        <div className="flex items-center">
          <div>
            <UserCircle size={40} />
          </div>
          <div className="ml-2">
            <div className="font-bold text-md">{row.original.fullName}</div>
            <div className="text-sm text-gray-500">{row.original.username}</div>
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: "verified",
    header: "Verified",
    cell: ({ row }) => {
      return <div>{row.original.unsafeMetadata.verified ? "Yes" : "No"}</div>;
    },
  },
];
