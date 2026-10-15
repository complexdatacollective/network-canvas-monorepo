'use client';

import { ChevronUp } from 'lucide-react';
import type { Ref } from 'react';

import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@codaco/fresco-ui/DropdownMenu';
import {
  defineToolbarChild,
  ToolbarButton,
  ToolbarMenu,
} from '@codaco/fresco-ui/SegmentedToolbar';

type Disease = {
  id: string;
  label: string;
  color: string;
};

/** The control's words, from the stage's settings. */
export type ConditionControlWords = Readonly<{
  selectCondition: string;
}>;

type ConditionControlProps = {
  words: ConditionControlWords;
  diseases: Disease[];
  selectedDiseaseId: string | null;
  onSelect: (id: string | null) => void;
  /** Forwarded to the toolbar button. */
  ref?: Ref<HTMLButtonElement>;
};

// Radio values: the choice of no condition, and each condition by its id
// behind a prefix, so no id can be mistaken for the choice of none.
const NO_CONDITION = 'none';
const conditionValue = (id: string) => `condition:${id}`;

function ColourDot({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="size-4 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}

/**
 * The condition the pedigree shows, in the canvas's toolbar. Its button
 * shows the chosen condition beside its colour; it opens a menu of every
 * condition as radio items, and choosing one applies at once and closes the
 * menu.
 */
function ConditionControl({
  words,
  diseases,
  selectedDiseaseId,
  onSelect,
  ref,
}: ConditionControlProps) {
  const selected =
    selectedDiseaseId === null
      ? undefined
      : diseases.find((disease) => disease.id === selectedDiseaseId);

  return (
    <ToolbarMenu
      ref={ref}
      trigger={
        <ToolbarButton data-testid="narrative-pedigree-condition">
          <span className="flex max-w-xs min-w-0 items-center gap-2">
            {selected && <ColourDot color={selected.color} />}
            <span className="min-w-0 truncate">
              {selected?.label ?? words.selectCondition}
            </span>
            <ChevronUp aria-hidden className="size-4 shrink-0" />
          </span>
        </ToolbarButton>
      }
      contentProps={{
        side: 'top',
        // A long list scrolls within the space above the toolbar.
        className:
          'flex max-h-(--available-height) max-w-[calc(100vw-2rem)] flex-col',
      }}
    >
      <DropdownMenuRadioGroup
        className="-m-1 min-h-0 overflow-y-auto p-1"
        value={
          selectedDiseaseId === null
            ? NO_CONDITION
            : conditionValue(selectedDiseaseId)
        }
        onValueChange={(chosen: unknown) => {
          if (chosen === NO_CONDITION) {
            onSelect(null);
            return;
          }
          const disease = diseases.find(
            (candidate) => conditionValue(candidate.id) === chosen,
          );
          if (disease) onSelect(disease.id);
        }}
      >
        <DropdownMenuRadioItem value={NO_CONDITION} closeOnClick>
          <span className="flex items-center gap-2">
            <span aria-hidden className="size-4 shrink-0" />
            {words.selectCondition}
          </span>
        </DropdownMenuRadioItem>
        {diseases.map((disease) => (
          <DropdownMenuRadioItem
            key={disease.id}
            value={conditionValue(disease.id)}
            closeOnClick
          >
            <span className="flex items-center gap-2">
              <ColourDot color={disease.color} />
              {disease.label}
            </span>
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </ToolbarMenu>
  );
}

export default defineToolbarChild(ConditionControl);
