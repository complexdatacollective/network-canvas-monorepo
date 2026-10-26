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

/** The words of the free-draw annotation controls. */
export type DrawingWords = Readonly<{
  enableDrawing: string;
  disableDrawing: string;
  freezeAnnotations: string;
  unfreezeAnnotations: string;
  resetAnnotations: string;
}>;

type BehavioursPanelProps = {
  // Whether to show the auto-layout toggle, which the protocol's interface
  // text words (`buttons.pauseLayout`): only while the automatic layout is
  // active (there are positioned nodes). Pausing freezes the layout so
  // dragging a node repositions it manually instead of reheating the
  // simulation.
  showLayoutToggle: boolean;
  simulationEnabled: boolean;
  onToggleSimulation: () => void;
  // The stage's words for the free-draw controls, given only when the stage
  // enables freeDraw.
  drawingWords: DrawingWords | undefined;
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
  drawingWords,
  isDrawingEnabled,
  isFrozen,
  onToggleDrawing,
  onToggleFreeze,
  onReset,
}: BehavioursPanelProps) {
  const intl = useAppIntl();
  if (!showLayoutToggle && drawingWords === undefined) return null;

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
            aria-label={intl.formatMessage(
              simulationEnabled
                ? interfaceMessages.pauseLayout
                : interfaceMessages.resumeLayout,
            )}
            icon={simulationEnabled ? <Pause /> : <Play />}
            onClick={onToggleSimulation}
          />
        </ToolbarGroup>
      ) : null}

      {showLayoutToggle && drawingWords !== undefined ? (
        <ToolbarSeparator key="drawing-separator" />
      ) : null}

      {drawingWords !== undefined ? (
        <ToolbarGroup
          key="drawing"
          aria-label={intl.formatMessage(interfaceMessages.drawingControls)}
        >
          <ToolbarIconButton
            aria-label={
              isDrawingEnabled
                ? drawingWords.disableDrawing
                : drawingWords.enableDrawing
            }
            icon={<Pencil />}
            pressed={isDrawingEnabled}
            onPressedChange={onToggleDrawing}
          />
          <ToolbarIconButton
            aria-label={
              isFrozen
                ? drawingWords.unfreezeAnnotations
                : drawingWords.freezeAnnotations
            }
            icon={<Snowflake />}
            pressed={isFrozen}
            onPressedChange={onToggleFreeze}
          />
          <ToolbarIconButton
            aria-label={drawingWords.resetAnnotations}
            icon={<RotateCcw />}
            onClick={onReset}
          />
        </ToolbarGroup>
      ) : null}
    </SegmentedToolbar>
  );
}
