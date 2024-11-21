"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { Dispatch, SetStateAction } from "react";
import type { Event } from "~/app/_actions/actions";
import { DataTableColumnHeader } from "~/components/DataTable/column-header";
import { MetadataDialog } from "~/components/MetadataDialog";
import type { EventType } from "./EventsTable";
import { StackTraceDialog } from "./StackTraceDialog";
import TableFilter from "./TableFilter";

export const getColumns = (eventTypes: EventType[], setEventTypes: Dispatch<SetStateAction<EventType[]>>) => {
	const columns: ColumnDef<Event>[] = [
		{
			accessorKey: "type",
			header: ({ column }) => (
				<div className="flex space-x-4">
					<TableFilter eventTypes={eventTypes} setEventTypes={setEventTypes} />
					<DataTableColumnHeader column={column} />
				</div>
			),
		},
		{
			accessorKey: "timestamp",
			header: ({ column }) => <DataTableColumnHeader column={column} title="Timestamp" />,
			cell: ({ row }) => {
				return <div className="break-all">{row.original.timestamp.toUTCString()}</div>;
			},
		},
		{
			accessorKey: "installationId",
			header: ({ column }) => <DataTableColumnHeader column={column} title="Installation Id" />,
			cell: ({ row }) => {
				return <div className="break-all">{row.original.installationId}</div>;
			},
		},
		{
			accessorKey: "name",
			header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
		},
		{
			accessorKey: "message",
			header: ({ column }) => <DataTableColumnHeader column={column} title="Message" />,
		},
		{
			accessorKey: "cause",
			header: ({ column }) => <DataTableColumnHeader column={column} title="Cause" />,
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

	return columns;
};
