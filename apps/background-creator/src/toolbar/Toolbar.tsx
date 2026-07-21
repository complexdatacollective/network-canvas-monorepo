import {
  Circle,
  File,
  FileCode,
  FileOutput,
  FilePlus,
  FolderOpen,
  Goal,
  ImageDown,
  Info,
  LayoutGrid,
  Minus,
  MousePointer2,
  Pentagon,
  Proportions,
  Redo2,
  Square,
  Target,
  Type,
  Undo2,
} from 'lucide-react';
import { type ReactElement, useRef, useState } from 'react';

import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import {
  SegmentedToolbar,
  type ToolbarSegment,
} from '@codaco/fresco-ui/SegmentedToolbar';
import { type EditorTool, useEditorStore } from '~/state/editorStore';

import {
  downloadSvgFlow,
  exportScriptFlow,
  newDocumentFlow,
  openSvgFlow,
} from './fileActions';
import { PreviewPanel } from './PreviewPanel';

const DRAW_TOOLS: EditorTool[] = [
  'select',
  'rect',
  'ellipse',
  'line',
  'polygon',
  'text',
];

// The single-select toggle group hands back a string array; recover the typed
// tool without an assertion by matching the known tool list.
function toEditorTool(value: string | undefined): EditorTool | null {
  return DRAW_TOOLS.find((tool) => tool === value) ?? null;
}

function selectedFor(active: EditorTool): string[] {
  return DRAW_TOOLS.includes(active) ? [active] : [];
}

type ToolbarProps = {
  // Re-opens the first-run welcome dialog (the Information button).
  onShowWelcome: () => void;
};

export function Toolbar({ onShowWelcome }: ToolbarProps): ReactElement {
  const dialogs = useDialog();
  // Bounds the draggable toolbar to the viewport so it stays reachable.
  const overlayRef = useRef<HTMLDivElement>(null);

  const activeTool = useEditorStore((s) => s.activeTool);
  const zonesVisible = useEditorStore((s) => s.zonesVisible);
  const setTool = useEditorStore((s) => s.setTool);
  const toggleZonesVisible = useEditorStore((s) => s.toggleZonesVisible);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const canUndo = useEditorStore((s) => s.canUndo());
  const canRedo = useEditorStore((s) => s.canRedo());

  const [previewOpen, setPreviewOpen] = useState(false);

  const handleToolChange = (values: string[]) => {
    const tool = toEditorTool(values[values.length - 1]);
    if (tool) setTool(tool);
  };

  const handleNewSelect = (value: string) => {
    switch (value) {
      case 'blank':
        void newDocumentFlow(dialogs, 'blank');
        break;
      case 'quadrants':
        void newDocumentFlow(dialogs, 'quadrants');
        break;
      case 'concentric':
        void newDocumentFlow(dialogs, 'concentric');
        break;
      default:
        break;
    }
  };

  // Every way to get artwork out of the editor lives under one "Export" menu:
  // the finished SVG for Architect, plus the ready-to-run zone-assignment
  // scripts in either language.
  const handleExportSelect = (value: string) => {
    switch (value) {
      case 'svg':
        void downloadSvgFlow();
        break;
      case 'r':
        void exportScriptFlow(dialogs, 'r');
        break;
      case 'python':
        void exportScriptFlow(dialogs, 'python');
        break;
      default:
        break;
    }
  };

  const items: ToolbarSegment[] = [
    {
      type: 'group',
      id: 'draw-tools',
      mode: 'single',
      value: selectedFor(activeTool),
      onValueChange: handleToolChange,
      options: [
        { value: 'select', label: 'Select', icon: <MousePointer2 /> },
        { value: 'rect', label: 'Rectangle', icon: <Square /> },
        { value: 'ellipse', label: 'Ellipse', icon: <Circle /> },
        { value: 'line', label: 'Line', icon: <Minus /> },
        { value: 'polygon', label: 'Polygon', icon: <Pentagon /> },
        { value: 'text', label: 'Text', icon: <Type /> },
      ],
    },
    { type: 'separator', id: 'sep-tools' },
    {
      type: 'toggle',
      id: 'toggle-zones',
      label: zonesVisible ? 'Hide zones' : 'Show zones',
      icon: <Goal />,
      pressed: zonesVisible,
      onPressedChange: () => toggleZonesVisible(),
    },
    {
      type: 'popover',
      id: 'preview',
      label: 'Preview',
      icon: <Proportions />,
      // The toolbar floats at the bottom, so popovers open upward into the canvas.
      side: 'top',
      open: previewOpen,
      onOpenChange: setPreviewOpen,
      pressed: previewOpen,
      children: <PreviewPanel />,
    },
    { type: 'separator', id: 'sep-history' },
    {
      type: 'button',
      id: 'undo',
      label: 'Undo',
      icon: <Undo2 />,
      disabled: !canUndo,
      onClick: () => undo(),
    },
    {
      type: 'button',
      id: 'redo',
      label: 'Redo',
      icon: <Redo2 />,
      disabled: !canRedo,
      onClick: () => redo(),
    },
    { type: 'separator', id: 'sep-document' },
    {
      type: 'menu',
      id: 'new',
      label: 'New',
      icon: <FilePlus />,
      kind: 'actions',
      onSelect: handleNewSelect,
      options: [
        { value: 'blank', label: 'Blank canvas', icon: <File /> },
        {
          value: 'quadrants',
          label: 'Quadrants template',
          icon: <LayoutGrid />,
        },
        { value: 'concentric', label: 'Circles template', icon: <Target /> },
      ],
    },
    {
      type: 'button',
      id: 'open',
      label: 'Open',
      icon: <FolderOpen />,
      onClick: () => void openSvgFlow(dialogs),
    },
    {
      type: 'menu',
      id: 'export',
      label: 'Export',
      icon: <FileOutput />,
      kind: 'actions',
      onSelect: handleExportSelect,
      options: [
        { value: 'svg', label: 'Download SVG', icon: <ImageDown /> },
        { value: 'r', label: 'Export R script', icon: <FileCode /> },
        { value: 'python', label: 'Export Python script', icon: <FileCode /> },
      ],
    },
    { type: 'separator', id: 'sep-info' },
    {
      type: 'button',
      id: 'information',
      label: 'Information',
      icon: <Info />,
      onClick: onShowWelcome,
    },
  ];

  return (
    // Full-window overlay that centres the toolbar along the bottom while letting
    // pointer events fall through to the canvas everywhere except the toolbar.
    // The overlay is also the drag boundary: without it the toolbar could be
    // dragged fully off-screen with no way back short of a reload (losing edits).
    <div
      ref={overlayRef}
      className="pointer-events-none absolute inset-0 z-20 flex items-end justify-center pb-6"
    >
      <SegmentedToolbar
        label="Editor toolbar"
        items={items}
        orientation="horizontal"
        size="md"
        draggable
        dragConstraints={overlayRef}
        className="pointer-events-auto"
      />
    </div>
  );
}
