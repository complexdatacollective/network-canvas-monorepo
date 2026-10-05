import { Pause as PauseIcon, Play as PlayIcon } from 'lucide-react';

import { AppMessage } from '@codaco/app-i18n/react';
import Button from '@codaco/fresco-ui/Button';

import { interfaceMessages } from '../messages';

type SimulationPanelProps = {
  simulationEnabled: boolean;
  onToggle: () => void;
};

export default function SimulationPanel({
  simulationEnabled,
  onToggle,
}: SimulationPanelProps) {
  return (
    <Button
      color="dynamic"
      onClick={onToggle}
      className="flex items-center gap-2 px-4 py-2 text-sm"
      icon={simulationEnabled ? <PauseIcon /> : <PlayIcon />}
    >
      {simulationEnabled ? (
        <AppMessage message={interfaceMessages.pauseAutoLayout} />
      ) : (
        <AppMessage message={interfaceMessages.resumeAutoLayout} />
      )}
    </Button>
  );
}
