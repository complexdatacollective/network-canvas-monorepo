'use client';

import { Button } from '@codaco/fresco-ui/Button';

export type GroupVariable = {
  id: string;
  label: string;
  options: { value: string; label: string }[];
};

export type ActiveGroup = { variable: string; value: string };

type GroupPickerProps = {
  variable: GroupVariable;
  active: ActiveGroup | null;
  onSelect: (variable: string, value: string) => void;
};

/**
 * Popover content for the Groups tool: the stage's single categorical hull
 * variable, whose values are the selectable groups, listed vertically with a
 * swatch of each group's hull colour. Picking a value sets the group whose
 * membership a node tap toggles.
 */
export default function GroupPicker({
  variable,
  active,
  onSelect,
}: GroupPickerProps) {
  return (
    <div className="flex w-60 flex-col gap-1">
      {variable.options.map((option, index) => {
        const isActive =
          active?.variable === variable.id && active.value === option.value;
        return (
          <Button
            key={option.value}
            type="button"
            variant="text"
            size="sm"
            aria-pressed={isActive}
            className={
              isActive
                ? 'bg-selected! text-selected-contrast! justify-start! gap-2 rounded-full'
                : 'justify-start! gap-2 rounded-full'
            }
            onClick={() => onSelect(variable.id, option.value)}
          >
            {/* Swatch matches the hull colour: known options are coloured by
                their 1-based codebook position (see ConvexHullLayer). */}
            <span
              aria-hidden
              className="inline-block size-3 shrink-0 rounded-full"
              style={{ backgroundColor: `var(--cat-${index + 1})` }}
            />
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}
