'use client';

import {
  Link as EdgeIcon,
  MousePointer2 as SelectIcon,
  Plus as AddNodeIcon,
  Redo2 as RedoIcon,
  Shapes as GroupsIcon,
  Sparkles as AutoLayoutIcon,
  Undo2 as UndoIcon,
} from 'lucide-react';
import { useState } from 'react';

import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@codaco/fresco-ui/DropdownMenu';
import type { ValidationPropsCatalogue } from '@codaco/fresco-ui/form/Field/types';
import type { ValidationContext } from '@codaco/fresco-ui/form/store/types';
import {
  SegmentedToolbar,
  ToolbarGroup,
  ToolbarIconButton,
  ToolbarMenu,
  ToolbarPopover,
  ToolbarSeparator,
} from '@codaco/fresco-ui/SegmentedToolbar';

import AddNodeInput from './AddNodeInput';
import GroupPicker, {
  type ActiveGroup,
  type GroupVariable,
} from './GroupPicker';
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
  /** Protocol label for the node entity, shown in the add-node field. */
  nodeLabel: string;
  /** Codebook variable the quick-add name is written to. */
  quickAddTargetVariable: string;
  onAddNode: (name: string) => Promise<void>;
  /** Validation props derived from quickAddTargetVariable's codebook definition. */
  quickAddValidationProps?: Partial<ValidationPropsCatalogue>;
  quickAddValidationContext?: ValidationContext;
  /** Categorical variable configured for convex-hull groups (null = no tool). */
  groupVariable: GroupVariable | null;
  activeGroup: ActiveGroup | null;
  onSelectGroup: (variable: string, value: string) => void;
  automaticLayout: boolean;
  onToggleAutomaticLayout: (next: boolean) => void;
};

// Codebook edge colour token → Tailwind background/foreground classes. Literal
// strings so Tailwind extracts them; the edge tool button adopts its type's
// colour while active. Covers the schema's EdgeColorSequence (seq-1..8);
// anything else falls back to seq-1 below.
const EDGE_BG_CLASS: Record<string, string> = {
  'edge-color-seq-1': 'bg-edge-1 text-white',
  'edge-color-seq-2': 'bg-edge-2 text-white',
  'edge-color-seq-3': 'bg-edge-3 text-white',
  'edge-color-seq-4': 'bg-edge-4 text-white',
  'edge-color-seq-5': 'bg-edge-5 text-white',
  'edge-color-seq-6': 'bg-edge-6 text-white',
  'edge-color-seq-7': 'bg-edge-7 text-white',
  'edge-color-seq-8': 'bg-edge-8 text-white',
};

// 1-based option position → categorical palette classes. Literal strings so
// Tailwind extracts them; the Groups tool button adopts the active group's
// hull colour (the same --cat-N the ConvexHullLayer paints with).
const GROUP_BG_CLASS: Record<number, string> = {
  1: 'bg-(--cat-1) text-white',
  2: 'bg-(--cat-2) text-white',
  3: 'bg-(--cat-3) text-white',
  4: 'bg-(--cat-4) text-white',
  5: 'bg-(--cat-5) text-white',
  6: 'bg-(--cat-6) text-white',
  7: 'bg-(--cat-7) text-white',
  8: 'bg-(--cat-8) text-white',
  9: 'bg-(--cat-9) text-white',
  10: 'bg-(--cat-10) text-white',
};

export default function ToolPalette({
  composerStore,
  undoStore,
  edges,
  nodeLabel,
  quickAddTargetVariable,
  onAddNode,
  quickAddValidationProps,
  quickAddValidationContext,
  groupVariable,
  activeGroup,
  onSelectGroup,
  automaticLayout,
  onToggleAutomaticLayout,
}: ToolPaletteProps) {
  const activeTool = useComposerStore(composerStore, (s) => s.activeTool);
  const canUndo = useUndoStore(undoStore, (s) => s.past.length > 0);
  const canRedo = useUndoStore(undoStore, (s) => s.future.length > 0);
  // The Groups popover opens on click and closes once a group is picked, so its
  // open state is independent of whether the group tool is active.
  const [groupsOpen, setGroupsOpen] = useState(false);

  const { setActiveTool } = composerStore.getState();

  const activeEdgeType =
    activeTool.kind === 'edge' ? activeTool.edgeType : undefined;
  const activeEdgeColor =
    activeEdgeType !== undefined
      ? edges.find((edge) => edge.edgeType === activeEdgeType)?.color
      : undefined;
  const edgeButtonClass =
    activeEdgeType !== undefined
      ? (EDGE_BG_CLASS[activeEdgeColor ?? ''] ?? 'bg-edge-1 text-white')
      : undefined;

  // While the group tool is active, the Groups button adopts the active
  // group's hull colour (mirroring the edge tool above).
  const activeGroupIndex =
    activeGroup !== null && groupVariable !== null
      ? groupVariable.options.findIndex(
          (option) => option.value === activeGroup.value,
        )
      : -1;
  const groupButtonClass =
    activeGroupIndex >= 0 ? GROUP_BG_CLASS[activeGroupIndex + 1] : undefined;

  return (
    <SegmentedToolbar
      aria-label="Network composer tools"
      orientation="vertical"
      size="lg"
      className="absolute top-1/2 left-4 z-10 -translate-y-1/2"
    >
      <ToolbarGroup aria-label="Editing tools">
        <ToolbarIconButton
          aria-label="Select"
          icon={<SelectIcon />}
          pressed={activeTool.kind === 'select'}
          onPressedChange={() => setActiveTool({ kind: 'select' })}
        />

        {/* Adding a node opens a name field next to this button. Closing the
            popover returns to select mode. */}
        <ToolbarPopover
          open={activeTool.kind === 'addNode'}
          onOpenChange={(open) =>
            setActiveTool(open ? { kind: 'addNode' } : { kind: 'select' })
          }
          trigger={
            <ToolbarIconButton
              aria-label="Add node"
              aria-pressed={activeTool.kind === 'addNode'}
              icon={<AddNodeIcon />}
            />
          }
        >
          <AddNodeInput
            entityLabel={nodeLabel}
            targetVariable={quickAddTargetVariable}
            onCreate={onAddNode}
            validationContext={quickAddValidationContext}
            {...quickAddValidationProps}
          />
        </ToolbarPopover>

        {/* One edge button opens a menu instead of crowding the toolbar with
            identical link icons. */}
        {edges.length > 0 ? (
          <ToolbarMenu
            trigger={
              <ToolbarIconButton
                aria-label="Draw edge"
                aria-pressed={activeTool.kind === 'edge'}
                icon={<EdgeIcon />}
                className={edgeButtonClass}
              />
            }
          >
            <DropdownMenuRadioGroup
              value={activeEdgeType}
              onValueChange={(edgeType) =>
                setActiveTool({ kind: 'edge', edgeType })
              }
            >
              {edges.map(({ edgeType, label }) => (
                <DropdownMenuRadioItem
                  key={edgeType}
                  value={edgeType}
                  closeOnClick
                >
                  {label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </ToolbarMenu>
        ) : null}

        {/* A single Groups button opens the active group value picker. */}
        {groupVariable !== null ? (
          <ToolbarPopover
            open={groupsOpen}
            onOpenChange={setGroupsOpen}
            trigger={
              <ToolbarIconButton
                aria-label="Groups"
                aria-pressed={activeTool.kind === 'group'}
                icon={<GroupsIcon />}
                className={groupButtonClass}
              />
            }
          >
            <GroupPicker
              variable={groupVariable}
              active={activeGroup}
              onSelect={(variable, value) => {
                onSelectGroup(variable, value);
                setGroupsOpen(false);
              }}
            />
          </ToolbarPopover>
        ) : null}
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup aria-label="Layout tools">
        <ToolbarIconButton
          aria-label="Automatic layout"
          icon={<AutoLayoutIcon />}
          pressed={automaticLayout}
          onPressedChange={onToggleAutomaticLayout}
        />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup aria-label="History tools">
        <ToolbarIconButton
          aria-label="Undo"
          icon={<UndoIcon />}
          disabled={!canUndo}
          onClick={() => void undoStore.getState().undo()}
        />
        <ToolbarIconButton
          aria-label="Redo"
          icon={<RedoIcon />}
          disabled={!canRedo}
          onClick={() => void undoStore.getState().redo()}
        />
      </ToolbarGroup>
    </SegmentedToolbar>
  );
}
