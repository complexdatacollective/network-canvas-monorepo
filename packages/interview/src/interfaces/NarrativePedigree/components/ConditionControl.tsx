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

// The choice that shows every condition. A disease id is a protocol
// identifier, which never starts with a NUL character.
const ALL_CONDITIONS = '\u0000all';

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
        className: 'max-h-(--available-height) max-w-[calc(100vw-2rem)]',
      }}
    >
      <DropdownMenuRadioGroup
        value={selectedDiseaseId ?? ALL_CONDITIONS}
        onValueChange={(chosen: unknown) => {
          if (typeof chosen !== 'string') return;
          onSelect(chosen === ALL_CONDITIONS ? null : chosen);
        }}
      >
        <DropdownMenuRadioItem value={ALL_CONDITIONS} closeOnClick>
          <span className="flex items-center gap-2">
            <span aria-hidden className="size-4 shrink-0" />
            {words.selectCondition}
          </span>
        </DropdownMenuRadioItem>
        {diseases.map((disease) => (
          <DropdownMenuRadioItem
            key={disease.id}
            value={disease.id}
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
