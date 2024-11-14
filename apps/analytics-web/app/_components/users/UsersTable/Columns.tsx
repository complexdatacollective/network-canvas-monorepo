"use client";
import type { ColumnDef } from "@tanstack/react-table";
import VerifyUserSwitch from "./VerifyUserSwitch";

type UserColumn = ColumnDef<
	{
		id: string;
		fullName: string;
		username: string | null;
		verified: boolean;
	},
	unknown
>;

export const columns: UserColumn[] = [
	{
		accessorKey: "user",
		header: "User",
		cell: ({ row }) => {
			return (
				<div className={row.original.verified ? "" : "text-muted-foreground"}>
					<div className="text-md font-bold">{row.original.fullName}</div>
					<div className="text-gray-500 text-sm">{row.original.username}</div>
				</div>
			);
		},
	},
	{
		accessorKey: "verified",
		header: "Verified",
		cell: ({ row }) => {
			return <VerifyUserSwitch id={row.original.id} verified={row.original.verified} />;
		},
	},
];
