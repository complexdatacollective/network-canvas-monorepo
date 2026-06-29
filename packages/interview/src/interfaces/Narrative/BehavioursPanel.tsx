import { Pause, Pencil, Play, RotateCcw, Snowflake } from 'lucide-react';

import {
  SegmentedToolbar,
  type ToolbarSegment,
} from '@codaco/fresco-ui/SegmentedToolbar';

type BehavioursPanelProps = {
  // Auto-layout pause/resume. Shown whenever the automatic layout is active
  // (there are positioned nodes). Pausing freezes the layout so dragging a node
  // repositions it manually instead of reheating the simulation.
  showLayoutToggle: boolean;
  simulationEnabled: boolean;
  onToggleSimulation: () => void;
  // Free-draw annotation controls, shown only when the stage enables freeDraw.
  showDrawingControls: boolean;
  isDrawingEnabled: boolean;
  isFrozen: boolean;
  onToggleDrawing: () => void;
  onToggleFreeze: () => void;
  onReset: () => void;
};

// Floating bottom-left toolbar collecting the Narrative interface's behaviour
// controls: the automatic-layout pause/resume toggle and (when enabled) the
// free-draw annotation tools.
export default function BehavioursPanel({
  showLayoutToggle,
  simulationEnabled,
  onToggleSimulation,
  showDrawingControls,
  isDrawingEnabled,
  isFrozen,
  onToggleDrawing,
  onToggleFreeze,
  onReset,
}: BehavioursPanelProps) {
  if (!showLayoutToggle && !showDrawingControls) return null;

  const items: ToolbarSegment[] = [];

  if (showLayoutToggle) {
    items.push({
      type: 'button',
      id: 'layout',
      label: simulationEnabled
        ? 'Pause automatic layout'
        : 'Resume automatic layout',
      icon: simulationEnabled ? <Pause /> : <Play />,
      onClick: onToggleSimulation,
    });
  }

  if (showLayoutToggle && showDrawingControls) {
    items.push({ type: 'separator', id: 'sep' });
  }

  if (showDrawingControls) {
    items.push(
      {
        type: 'toggle',
        id: 'draw',
        label: isDrawingEnabled ? 'Disable drawing' : 'Enable drawing',
        icon: <Pencil />,
        pressed: isDrawingEnabled,
        onPressedChange: onToggleDrawing,
      },
      {
        type: 'toggle',
        id: 'freeze',
        label: isFrozen ? 'Unfreeze annotations' : 'Freeze annotations',
        icon: <Snowflake />,
        pressed: isFrozen,
        onPressedChange: onToggleFreeze,
      },
      {
        type: 'button',
        id: 'reset',
        label: 'Reset annotations',
        icon: <RotateCcw />,
        onClick: onReset,
      },
    );
  }

  return (
    <SegmentedToolbar
      label="Layout and drawing tools"
      items={items}
      size="lg"
      className="absolute bottom-10 left-10 z-10"
    />
  );
}
