"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
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
  const [options, setOptions] = useState<EventType[]>(eventTypes);

  const toggleOption = (option: string) => {
    setOptions((prevState) =>
      prevState.map((t) =>
        t.text === option ? { ...t, isSelected: !t.isSelected } : t
      )
    );
  };

  const toggleAllOptions = (isSelected: boolean) => {
    setOptions((prevState) => prevState.map((t) => ({ ...t, isSelected })));
  };

  const isAllSelected = options.every((option) => option.isSelected);

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

          {options.map((option) => (
            <label
              key={option.text}
              className="text-sm flex items-center gap-3 pl-2 transition-colors hover:bg-muted p-1 rounded-md"
            >
              <Checkbox
                checked={option.isSelected}
                onCheckedChange={() => toggleOption(option.text)}
              />
              <span>{option.text}</span>
            </label>
          ))}

          <Button
            onClick={() => setEventTypes(options)}
            className="float-right"
            size={"sm"}
          >
            Apply
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default TableFilter;
