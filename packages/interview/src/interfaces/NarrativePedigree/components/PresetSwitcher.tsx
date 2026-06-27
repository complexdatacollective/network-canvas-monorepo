import { ChevronLeft, ChevronRight } from 'lucide-react';

import { IconButton } from '@codaco/fresco-ui/Button';
import Surface from '@codaco/fresco-ui/layout/Surface';

export type PresetSwitcherEntry = {
  id: string;
  label: string;
};

type PresetSwitcherProps = {
  presets: PresetSwitcherEntry[];
  activeIndex: number;
  onChange: (index: number) => void;
};

/**
 * Minimal prev/next preset switcher for the read-only NarrativePedigree view.
 * Mirrors the Narrative interface's switcher (prev arrow + active label + next
 * arrow) without the highlight/edge/group accordion, which the read-only
 * disease view does not expose.
 */
export default function PresetSwitcher({
  presets,
  activeIndex,
  onChange,
}: PresetSwitcherProps) {
  const currentPreset = presets[activeIndex];
  if (!currentPreset) return null;

  return (
    <Surface
      noContainer
      spacing="xs"
      shadow="xs"
      className="flex items-center gap-2 rounded-full"
      data-preset-switcher
    >
      <IconButton
        disabled={activeIndex === 0}
        onClick={() => onChange(activeIndex - 1)}
        aria-label="Previous preset"
        icon={<ChevronLeft />}
        variant="text"
      />
      <span data-active-preset-label className="px-2 text-base">
        {currentPreset.label}
      </span>
      <IconButton
        icon={<ChevronRight />}
        aria-label="Next preset"
        disabled={activeIndex + 1 === presets.length}
        onClick={() => onChange(activeIndex + 1)}
        variant="text"
      />
    </Surface>
  );
}
