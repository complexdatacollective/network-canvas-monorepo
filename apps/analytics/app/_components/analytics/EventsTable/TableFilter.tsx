"use client";

import { type Dispatch, type SetStateAction } from "react";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { type EventType } from "./EventsTable";

type TableFilterProps = {
  eventTypes: EventType[];
  setEventTypes: Dispatch<SetStateAction<EventType[]>>;
};

const TableFilter = ({ eventTypes, setEventTypes }: TableFilterProps) => {
  const toggleOption = (option: string) => {
    setEventTypes((prevState) =>
      prevState.map((t) =>
        t.text === option ? { ...t, isSelected: !t.isSelected } : t
      )
    );
  };

  const toggleAllOptions = (isSelected: boolean) => {
    setEventTypes((prevState) => prevState.map((t) => ({ ...t, isSelected })));
  };

  const isAllSelected = eventTypes.every((option) => option.isSelected);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="text-sm" size={"sm"} variant="outline">
          Type
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-52 ml-12">
        <DropdownMenuLabel>Select events</DropdownMenuLabel>
        <DropdownMenuSeparator />

        <div className="space-y-3">
          <label className="text-sm flex items-center gap-3 pl-2 transition-colors hover:bg-muted p-1 rounded-md">
            <Checkbox
              checked={isAllSelected}
              onCheckedChange={() => toggleAllOptions(!isAllSelected)}
            />
            <span>All</span>
          </label>
          <DropdownMenuSeparator />

          {eventTypes.map((type) => (
            <label
              key={type.text}
              className="text-sm flex items-center gap-3 pl-2 transition-colors hover:bg-muted p-1 rounded-md"
            >
              <Checkbox
                checked={type.isSelected}
                onCheckedChange={() => toggleOption(type.text)}
              />
              <span>{type.text}</span>
            </label>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default TableFilter;
