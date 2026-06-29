'use client';

import {
  Link as EdgeIcon,
  MousePointer2 as SelectIcon,
  Plus as AddNodeIcon,
  Redo2 as RedoIcon,
  Undo2 as UndoIcon,
} from 'lucide-react';

import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import {
  SegmentedToolbar,
  type ToolbarSegment,
} from '@codaco/fresco-ui/SegmentedToolbar';

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
  automaticLayout: boolean;
  onToggleAutomaticLayout: (next: boolean) => void;
};

// Stable option values for the exclusive tool group. Edge types are namespaced
// so a codebook edge id can never collide with the built-in tools.
const TOOL_SELECT = 'tool:select';
const TOOL_ADD_NODE = 'tool:addNode';
const EDGE_PREFIX = 'edge:';

export default function ToolPalette({
  composerStore,
  undoStore,
  edges,
  automaticLayout,
  onToggleAutomaticLayout,
}: ToolPaletteProps) {
  const activeTool = useComposerStore(composerStore, (s) => s.activeTool);
  const canUndo = useUndoStore(undoStore, (s) => s.past.length > 0);
  const canRedo = useUndoStore(undoStore, (s) => s.future.length > 0);

  const { setActiveTool } = composerStore.getState();

  const activeToolValue =
    activeTool.kind === 'select'
      ? TOOL_SELECT
      : activeTool.kind === 'addNode'
        ? TOOL_ADD_NODE
        : activeTool.kind === 'edge'
          ? `${EDGE_PREFIX}${activeTool.edgeType}`
          : null;

  // The interaction buttons — an exclusive tool group (Select / Add node / one
  // per edge type) and the undo/redo history actions.
  const items: ToolbarSegment[] = [
    { type: 'label', id: 'tools-label', text: 'Tools' },
    {
      type: 'group',
      id: 'tools',
      mode: 'single',
      value: activeToolValue ? [activeToolValue] : [],
      // Single-select groups can emit an empty value when the active item is
      // re-clicked; ignore that so a tool is always active (the value is
      // controlled, so it snaps back to the current tool).
      onValueChange: (value) => {
        const next = value[0];
        if (!next) return;
        if (next === TOOL_SELECT) {
          setActiveTool({ kind: 'select' });
        } else if (next === TOOL_ADD_NODE) {
          setActiveTool({ kind: 'addNode' });
        } else {
          setActiveTool({
            kind: 'edge',
            edgeType: next.slice(EDGE_PREFIX.length),
          });
        }
      },
      options: [
        {
          value: TOOL_SELECT,
          label: 'Select',
          icon: <SelectIcon />,
          showLabel: true,
        },
        {
          value: TOOL_ADD_NODE,
          label: 'Add node',
          icon: <AddNodeIcon />,
          showLabel: true,
        },
        ...edges.map(({ edgeType, label }) => ({
          value: `${EDGE_PREFIX}${edgeType}`,
          label,
          icon: <EdgeIcon />,
          showLabel: true,
        })),
      ],
    },
    { type: 'label', id: 'history-label', text: 'History' },
    {
      type: 'button',
      id: 'undo',
      label: 'Undo',
      icon: <UndoIcon />,
      showLabel: true,
      disabled: !canUndo,
      onClick: () => void undoStore.getState().undo(),
    },
    {
      type: 'button',
      id: 'redo',
      label: 'Redo',
      icon: <RedoIcon />,
      showLabel: true,
      disabled: !canRedo,
      onClick: () => void undoStore.getState().redo(),
    },
  ];

  return (
    <div className="absolute top-1/2 left-4 z-10 flex -translate-y-1/2 flex-col items-start gap-2">
      <SegmentedToolbar
        label="Network composer tools"
        items={items}
        orientation="vertical"
      />
      {/* Automatic layout is an on/off setting, not a tool — a switch, not a
          toolbar button. */}
      <div className="bg-surface-1 elevation-low flex items-center gap-3 rounded-full px-4 py-2">
        <span className="text-xs font-semibold tracking-wide text-current/60 uppercase">
          Auto layout
        </span>
        <ToggleField
          value={automaticLayout}
          onChange={(value) => onToggleAutomaticLayout(value ?? false)}
          aria-label="Automatic layout"
        />
      </div>
    </div>
  );
}
