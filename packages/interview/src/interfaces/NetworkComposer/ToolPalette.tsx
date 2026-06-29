'use client';

import {
  Link as EdgeIcon,
  MousePointer2 as SelectIcon,
  Play as PlayIcon,
  Pause as PauseIcon,
  Plus as AddNodeIcon,
  Redo2 as RedoIcon,
  Undo2 as UndoIcon,
} from 'lucide-react';

import Button from '@codaco/fresco-ui/Button';

import { type ComposerStoreApi, useComposerStore } from './useComposerStore';
import { type UndoStoreApi, useUndoStore } from './useUndoStore';

type EdgeEntry = {
  edgeType: string;
  label: string;
  color?: string;
};

type ToolPaletteProps = {
  composerStore: ComposerStoreApi;
  undoStore: UndoStoreApi;
  edges: EdgeEntry[];
  automaticLayout?: boolean;
  simulationEnabled?: boolean;
  onToggleSimulation?: () => void;
};

export default function ToolPalette({
  composerStore,
  undoStore,
  edges,
  automaticLayout = false,
  simulationEnabled = false,
  onToggleSimulation,
}: ToolPaletteProps) {
  const activeTool = useComposerStore(composerStore, (s) => s.activeTool);
  const canUndo = useUndoStore(undoStore, (s) => s.past.length > 0);
  const canRedo = useUndoStore(undoStore, (s) => s.future.length > 0);

  const { setActiveTool } = composerStore.getState();

  const isSelectActive = activeTool.kind === 'select';
  const isAddNodeActive = activeTool.kind === 'addNode';

  return (
    <div className="absolute top-1/2 left-4 z-10 flex -translate-y-1/2 flex-col gap-2">
      <Button
        color="default"
        icon={<SelectIcon />}
        onClick={() => setActiveTool({ kind: 'select' })}
        aria-pressed={isSelectActive}
        aria-label="Select"
      >
        Select
      </Button>

      <Button
        color="primary"
        icon={<AddNodeIcon />}
        onClick={() => setActiveTool({ kind: 'addNode' })}
        aria-pressed={isAddNodeActive}
        aria-label="Add Node"
      >
        Add Node
      </Button>

      {edges.map(({ edgeType, label }) => {
        const isActive =
          activeTool.kind === 'edge' && activeTool.edgeType === edgeType;
        return (
          <Button
            key={edgeType}
            color="default"
            icon={<EdgeIcon />}
            onClick={() => setActiveTool({ kind: 'edge', edgeType })}
            aria-pressed={isActive}
            aria-label={label}
          >
            {label}
          </Button>
        );
      })}

      {automaticLayout && onToggleSimulation && (
        <Button
          color="dynamic"
          icon={simulationEnabled ? <PauseIcon /> : <PlayIcon />}
          onClick={onToggleSimulation}
          aria-pressed={simulationEnabled}
          aria-label={
            simulationEnabled ? 'Pause Auto Layout' : 'Resume Auto Layout'
          }
        >
          {simulationEnabled ? 'Pause Auto Layout' : 'Resume Auto Layout'}
        </Button>
      )}

      <Button
        color="default"
        variant="outline"
        icon={<UndoIcon />}
        disabled={!canUndo}
        onClick={() => void undoStore.getState().undo()}
        aria-label="Undo"
      >
        Undo
      </Button>

      <Button
        color="default"
        variant="outline"
        icon={<RedoIcon />}
        disabled={!canRedo}
        onClick={() => void undoStore.getState().redo()}
        aria-label="Redo"
      >
        Redo
      </Button>
    </div>
  );
}
