'use client';

import { Pause, Pencil, Play, RotateCcw, Snowflake } from 'lucide-react';

import { useAppIntl } from '@codaco/app-i18n/react';
import {
  SegmentedToolbar,
  ToolbarGroup,
  ToolbarIconButton,
  ToolbarSeparator,
} from '@codaco/fresco-ui/SegmentedToolbar';

import { interfaceMessages } from '../messages';

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
  const intl = useAppIntl();
  if (!showLayoutToggle && !showDrawingControls) return null;

  return (
    <SegmentedToolbar
      aria-label={intl.formatMessage(interfaceMessages.layoutAndDrawing)}
      size="lg"
      className="absolute bottom-10 left-10 z-10"
    >
      {showLayoutToggle ? (
        <ToolbarGroup
          key="layout"
          aria-label={intl.formatMessage(interfaceMessages.layoutControls)}
        >
          <ToolbarIconButton
            aria-label={
              simulationEnabled
                ? intl.formatMessage(interfaceMessages.pauseAutomaticLayout)
                : intl.formatMessage(interfaceMessages.resumeAutomaticLayout)
            }
            icon={simulationEnabled ? <Pause /> : <Play />}
            onClick={onToggleSimulation}
          />
        </ToolbarGroup>
      ) : null}

      {showLayoutToggle && showDrawingControls ? (
        <ToolbarSeparator key="drawing-separator" />
      ) : null}

      {showDrawingControls ? (
        <ToolbarGroup
          key="drawing"
          aria-label={intl.formatMessage(interfaceMessages.drawingControls)}
        >
          <ToolbarIconButton
            aria-label={
              isDrawingEnabled
                ? intl.formatMessage(interfaceMessages.disableDrawing)
                : intl.formatMessage(interfaceMessages.enableDrawing)
            }
            icon={<Pencil />}
            pressed={isDrawingEnabled}
            onPressedChange={onToggleDrawing}
          />
          <ToolbarIconButton
            aria-label={
              isFrozen
                ? intl.formatMessage(interfaceMessages.unfreezeAnnotations)
                : intl.formatMessage(interfaceMessages.freezeAnnotations)
            }
            icon={<Snowflake />}
            pressed={isFrozen}
            onPressedChange={onToggleFreeze}
          />
          <ToolbarIconButton
            aria-label={intl.formatMessage(interfaceMessages.resetAnnotations)}
            icon={<RotateCcw />}
            onClick={onReset}
          />
        </ToolbarGroup>
      ) : null}
    </SegmentedToolbar>
  );
}
