"use client";

import { type Dispatch, type SetStateAction, useState } from "react";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import type { EventType } from "./EventsTable";

type TableFilterProps = {
	eventTypes: EventType[];
	setEventTypes: Dispatch<SetStateAction<EventType[]>>;
};

const TableFilter = ({ eventTypes, setEventTypes }: TableFilterProps) => {
	const [options, setOptions] = useState<EventType[]>(eventTypes);

	const toggleOption = (option: string) => {
		setOptions((prevState) => prevState.map((t) => (t.text === option ? { ...t, isSelected: !t.isSelected } : t)));
	};

	const toggleAllOptions = (isSelected: boolean) => {
		setOptions((prevState) => prevState.map((t) => ({ ...t, isSelected })));
	};

	const isAllSelected = options.every((option) => option.isSelected);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild={true}>
				<Button className="text-sm" size={"sm"} variant="outline">
					Type
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent className="ml-12 w-52">
				<DropdownMenuLabel>Select events</DropdownMenuLabel>
				<DropdownMenuSeparator />

				<div className="space-y-3">
					<label
						for="all-checkbox"
						className="flex items-center gap-3 rounded-md p-1 pl-2 text-sm transition-colors hover:bg-muted"
					>
						<Checkbox
							id="all-checkbox"
							checked={isAllSelected}
							onCheckedChange={() => toggleAllOptions(!isAllSelected)}
						/>
						<span>All</span>
					</label>
					<DropdownMenuSeparator />

					{options.map((option) => (
						<label
							for={option.text}
							key={option.text}
							className="flex items-center gap-3 rounded-md p-1 pl-2 text-sm transition-colors hover:bg-muted"
						>
							<Checkbox
								id={option.text}
								checked={option.isSelected}
								onCheckedChange={() => toggleOption(option.text)}
							/>
							<span>{option.text}</span>
						</label>
					))}

					<Button onClick={() => setEventTypes(options)} className="float-right" size={"sm"}>
						Apply
					</Button>
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};

export default TableFilter;
