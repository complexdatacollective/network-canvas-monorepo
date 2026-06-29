'use client';

import { Button } from '@codaco/fresco-ui/Button';

export type GroupVariable = {
  id: string;
  label: string;
  options: { value: string; label: string }[];
};

export type ActiveGroup = { variable: string; value: string };

type GroupPickerProps = {
  variables: GroupVariable[];
  active: ActiveGroup | null;
  onSelect: (variable: string, value: string) => void;
};

/**
 * Popover content for the Groups tool: one categorical variable is active at a
 * time, so each configured variable is a labelled section whose values are the
 * selectable groups. Picking a value makes that variable's hulls active and
 * sets the group whose membership a node tap toggles.
 */
export default function GroupPicker({
  variables,
  active,
  onSelect,
}: GroupPickerProps) {
  return (
    <div className="flex w-60 flex-col gap-3">
      {variables.map((variable) => (
        <div key={variable.id} className="flex flex-col gap-1">
          {variables.length > 1 && (
            <p className="text-text/60 text-sm font-semibold">
              {variable.label}
            </p>
          )}
          <div className="flex flex-wrap gap-1">
            {variable.options.map((option) => {
              const isActive =
                active?.variable === variable.id &&
                active.value === option.value;
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
        </div>
      ))}
    </div>
  );
}
