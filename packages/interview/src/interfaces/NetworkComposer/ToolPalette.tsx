'use client';

import {
  Link as EdgeIcon,
  MousePointer2 as SelectIcon,
  Plus as AddNodeIcon,
  Redo2 as RedoIcon,
  Sparkles as AutoLayoutIcon,
  Undo2 as UndoIcon,
} from 'lucide-react';

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

// Stable option values for the exclusive Select/Add-node group.
const TOOL_SELECT = 'tool:select';
const TOOL_ADD_NODE = 'tool:addNode';

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

  const toolGroupValue =
    activeTool.kind === 'select'
      ? [TOOL_SELECT]
      : activeTool.kind === 'addNode'
        ? [TOOL_ADD_NODE]
        : [];
  const activeEdgeType =
    activeTool.kind === 'edge' ? activeTool.edgeType : undefined;

  const items: ToolbarSegment[] = [
    {
      type: 'group',
      id: 'tools',
      mode: 'single',
      value: toolGroupValue,
      // Selecting an edge type (via the edge menu) clears this group; ignore the
      // empty value a re-click would emit so the controlled value stays stable.
      onValueChange: (value) => {
        const next = value[0];
        if (next === TOOL_SELECT) {
          setActiveTool({ kind: 'select' });
        } else if (next === TOOL_ADD_NODE) {
          setActiveTool({ kind: 'addNode' });
        }
      },
      options: [
        { value: TOOL_SELECT, label: 'Select', icon: <SelectIcon /> },
        { value: TOOL_ADD_NODE, label: 'Add node', icon: <AddNodeIcon /> },
      ],
    },
    // Every edge type shares the link icon, so a single edge button opens a menu
    // to pick the type rather than crowding the toolbar with identical buttons.
    {
      type: 'menu',
      id: 'edge',
      label: 'Draw edge',
      icon: <EdgeIcon />,
      pressed: activeTool.kind === 'edge',
      value: activeEdgeType,
      options: edges.map(({ edgeType, label }) => ({ value: edgeType, label })),
      onSelect: (edgeType) => setActiveTool({ kind: 'edge', edgeType }),
    },
    { type: 'separator', id: 'sep-history' },
    {
      type: 'button',
      id: 'undo',
      label: 'Undo',
      icon: <UndoIcon />,
      disabled: !canUndo,
      onClick: () => void undoStore.getState().undo(),
    },
    {
      type: 'button',
      id: 'redo',
      label: 'Redo',
      icon: <RedoIcon />,
      disabled: !canRedo,
      onClick: () => void undoStore.getState().redo(),
    },
    { type: 'separator', id: 'sep-layout' },
    {
      type: 'toggle',
      id: 'auto-layout',
      label: 'Automatic layout',
      icon: <AutoLayoutIcon />,
      pressed: automaticLayout,
      onPressedChange: onToggleAutomaticLayout,
    },
  ];

  return (
    <SegmentedToolbar
      label="Network composer tools"
      items={items}
      orientation="vertical"
      className="absolute top-1/2 left-4 z-10 -translate-y-1/2"
    />
  );
}
