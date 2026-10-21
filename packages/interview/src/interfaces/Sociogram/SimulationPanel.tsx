'use client';

import { Pause as PauseIcon, Play as PlayIcon } from 'lucide-react';

import { IconButton } from '@codaco/fresco-ui/Button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@codaco/fresco-ui/Tooltip';

type SimulationPanelProps = {
  /** The stage's words for the toggle (`stage-wording/sociogram.ts`). */
  words: Readonly<{ pauseLayout: string; resumeLayout: string }>;
  simulationEnabled: boolean;
  onToggle: () => void;
};

export default function SimulationPanel({
  words,
  simulationEnabled,
  onToggle,
}: SimulationPanelProps) {
  const label = simulationEnabled ? words.pauseLayout : words.resumeLayout;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <IconButton
            color="dynamic"
            aria-label={label}
            icon={simulationEnabled ? <PauseIcon /> : <PlayIcon />}
            onClick={onToggle}
          />
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
