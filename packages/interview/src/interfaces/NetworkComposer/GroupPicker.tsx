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
 * variable, whose values are the selectable groups. Picking a value sets the
 * group whose membership a node tap toggles.
 */
export default function GroupPicker({
  variable,
  active,
  onSelect,
}: GroupPickerProps) {
  return (
    <div className="flex w-60 flex-wrap gap-1">
      {variable.options.map((option) => {
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
                ? 'bg-selected! text-selected-contrast! rounded-full'
                : 'rounded-full'
            }
            onClick={() => onSelect(variable.id, option.value)}
          >
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}
