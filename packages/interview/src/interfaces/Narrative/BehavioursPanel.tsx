import { Toggle } from '@base-ui/react/toggle';
import { Pause, Pencil, Play, RotateCcw, Snowflake } from 'lucide-react';

import { IconButton } from '@codaco/fresco-ui/Button';
import { MotionSurface } from '@codaco/fresco-ui/layout/Surface';
import { cx } from '@codaco/fresco-ui/utils/cva';

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

// Floating bottom-left panel collecting the Narrative interface's behaviour
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

  return (
    <MotionSurface
      noContainer
      className="bg-surface/80 absolute bottom-10 left-10 z-10 flex items-center rounded-2xl backdrop-blur-md"
      spacing="none"
      shadow="none"
      layout
    >
      {showLayoutToggle && (
        <IconButton
          icon={simulationEnabled ? <Pause /> : <Play />}
          onClick={onToggleSimulation}
          variant="text"
          size="lg"
          className="rounded-none"
          aria-label={
            simulationEnabled
              ? 'Pause automatic layout'
              : 'Resume automatic layout'
          }
        />
      )}
      {showDrawingControls && (
        <>
          <Toggle
            pressed={isDrawingEnabled}
            onPressedChange={onToggleDrawing}
            render={
              <IconButton
                icon={<Pencil />}
                variant="text"
                size="lg"
                className={cx(
                  'rounded-none',
                  isDrawingEnabled && 'bg-primary/40 text-primary',
                )}
                aria-label={
                  isDrawingEnabled ? 'Disable drawing' : 'Enable drawing'
                }
              />
            }
          />
          <Toggle
            pressed={isFrozen}
            onPressedChange={onToggleFreeze}
            render={
              <IconButton
                icon={<Snowflake />}
                variant="text"
                size="lg"
                className={cx(
                  'hover:enabled:bg-sea-serpent/40 rounded-none',
                  isFrozen &&
                    'bg-sea-serpent/40 hover:enabled:bg-sea-serpent/40 text-sea-serpent',
                )}
                aria-label={
                  isFrozen ? 'Unfreeze annotations' : 'Freeze annotations'
                }
              />
            }
          />
          <IconButton
            icon={<RotateCcw />}
            onClick={onReset}
            variant="text"
            size="lg"
            className="rounded-none"
            aria-label="Reset annotations"
          />
        </>
      )}
    </MotionSurface>
  );
}
