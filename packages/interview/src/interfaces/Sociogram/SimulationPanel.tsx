'use client';

import { Pause as PauseIcon, Play as PlayIcon } from 'lucide-react';

import { useAppIntl } from '@codaco/app-i18n/react';
import { IconButton } from '@codaco/fresco-ui/Button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@codaco/fresco-ui/Tooltip';

import { interfaceMessages } from '../messages';

type SimulationPanelProps = {
  simulationEnabled: boolean;
  onToggle: () => void;
};

export default function SimulationPanel({
  simulationEnabled,
  onToggle,
}: SimulationPanelProps) {
  const intl = useAppIntl();
  const label = intl.formatMessage(
    simulationEnabled
      ? interfaceMessages.pauseAutomaticLayout
      : interfaceMessages.resumeAutomaticLayout,
  );

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
