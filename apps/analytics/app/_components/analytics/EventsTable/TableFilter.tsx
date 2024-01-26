"use client";

import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { EventType } from "./EventsTable";
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

type TableFilterProps = {
  eventTypes: EventType[];
  setEventTypes: Dispatch<SetStateAction<EventType[]>>;
};

const TableFilter = ({ eventTypes, setEventTypes }: TableFilterProps) => {
  const [allSelected, setAllSelected] = useState(true);

  useEffect(() => {
    const updatedEventTypes = eventTypes.map((t) => ({
      ...t,
      isSelected: allSelected,
    }));
    setEventTypes(updatedEventTypes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allSelected]);

  const handleCheckedChange = (value: boolean, currentType: string) => {
    const updatedEventTypes = eventTypes.map((t) => {
      if (t.text === currentType) {
        return { ...t, isSelected: value };
      }
      return t;
    });

    // If all event types are selected, set allSelected to true
    if (updatedEventTypes.every((t) => t.isSelected)) {
      setAllSelected(true);
      return;
    }

    // If no event types are selected, set allSelected to false
    if (updatedEventTypes.every((t) => !t.isSelected)) {
      setAllSelected(false);
      return;
    }

    setEventTypes(updatedEventTypes);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">Event Types</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-52 ml-12">
        <DropdownMenuLabel>Select events</DropdownMenuLabel>
        <DropdownMenuSeparator />

        <div className="space-y-3">
          <label className="text-sm flex items-center gap-3 pl-2 transition-colors hover:bg-muted p-1 rounded-md">
            <Checkbox
              checked={allSelected}
              onCheckedChange={(val) => setAllSelected(Boolean(val))}
            />
            <span>All</span>
          </label>

          {eventTypes.map((type) => (
            <label
              key={type.text}
              className="text-sm flex items-center gap-3 pl-2 transition-colors hover:bg-muted p-1 rounded-md"
            >
              <Checkbox
                checked={type.isSelected}
                onCheckedChange={(val) =>
                  handleCheckedChange(Boolean(val), type.text)
                }
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
