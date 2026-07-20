import {
  Circle,
  Download,
  Eye,
  EyeOff,
  FileCode,
  FilePlus,
  FileText,
  FolderOpen,
  Minus,
  Monitor,
  MousePointer2,
  Pentagon,
  Redo2,
  Settings2,
  SlidersHorizontal,
  Square,
  Type,
  Undo2,
} from 'lucide-react';
import { type ReactElement, useEffect, useState } from 'react';

import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import {
  SegmentedToolbar,
  type ToolbarSegment,
} from '@codaco/fresco-ui/SegmentedToolbar';
import { type EditorTool, useEditorStore } from '~/state/editorStore';

import {
  documentDetailsFlow,
  downloadSvgFlow,
  exportScriptFlow,
  newDocumentFlow,
  openSvgFlow,
} from './fileActions';
import { PreviewPanel } from './PreviewPanel';
import { PropertiesPanel } from './PropertiesPanel';

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

export function Toolbar(): ReactElement {
  const dialogs = useDialog();

  const activeTool = useEditorStore((s) => s.activeTool);
  const zonesVisible = useEditorStore((s) => s.zonesVisible);
  const selection = useEditorStore((s) => s.selection);
  const canUndo = useEditorStore((s) => s.canUndo());
  const canRedo = useEditorStore((s) => s.canRedo());
  const setTool = useEditorStore((s) => s.setTool);
  const toggleZonesVisible = useEditorStore((s) => s.toggleZonesVisible);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [propertiesOpen, setPropertiesOpen] = useState(false);

  // Clearing the selection closes and disables the panel (nothing to edit).
  useEffect(() => {
    if (selection === null) setPropertiesOpen(false);
  }, [selection]);

  const handleToolChange = (values: string[]) => {
    const tool = toEditorTool(values[values.length - 1]);
    if (tool) setTool(tool);
  };

  const handleFileSelect = (value: string) => {
    switch (value) {
      case 'new-blank':
        void newDocumentFlow(dialogs, 'blank');
        break;
      case 'new-quadrants':
        void newDocumentFlow(dialogs, 'quadrants');
        break;
      case 'new-concentric':
        void newDocumentFlow(dialogs, 'concentric');
        break;
      case 'new-compass':
        void newDocumentFlow(dialogs, 'compass');
        break;
      case 'open':
        void openSvgFlow(dialogs);
        break;
      case 'download':
        void downloadSvgFlow();
        break;
      case 'export-python':
        void exportScriptFlow(dialogs, 'python');
        break;
      case 'export-r':
        void exportScriptFlow(dialogs, 'r');
        break;
      case 'details':
        void documentDetailsFlow(dialogs);
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
      icon: zonesVisible ? <Eye /> : <EyeOff />,
      pressed: zonesVisible,
      onPressedChange: () => toggleZonesVisible(),
    },
    {
      type: 'popover',
      id: 'preview',
      label: 'Preview',
      icon: <Monitor />,
      // The toolbar floats at the bottom, so popovers open upward into the canvas.
      side: 'top',
      open: previewOpen,
      onOpenChange: setPreviewOpen,
      pressed: previewOpen,
      children: <PreviewPanel />,
    },
    {
      type: 'popover',
      id: 'properties',
      label: 'Properties',
      icon: <SlidersHorizontal />,
      side: 'top',
      // Controlled: disabled with nothing selected. Standard outside-press
      // dismissal keeps this and the selection-anchored properties popover
      // mutually exclusive — opening one is an outside press that closes the
      // other, so an element never shows two live property panels at once.
      // (The effect below still closes it when `selection` becomes null.)
      disabled: selection === null,
      open: propertiesOpen,
      onOpenChange: setPropertiesOpen,
      pressed: propertiesOpen,
      children: <PropertiesPanel />,
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
    { type: 'separator', id: 'sep-file' },
    {
      type: 'menu',
      id: 'file',
      label: 'File',
      icon: <FolderOpen />,
      kind: 'actions',
      onSelect: handleFileSelect,
      options: [
        { value: 'new-blank', label: 'New — Blank', icon: <FilePlus /> },
        {
          value: 'new-quadrants',
          label: 'New — Quadrants template',
          icon: <FilePlus />,
        },
        {
          value: 'new-concentric',
          label: 'New — Concentric circles template',
          icon: <FilePlus />,
        },
        {
          value: 'new-compass',
          label: 'New — Political compass',
          icon: <FilePlus />,
        },
        { value: 'open', label: 'Open SVG…', icon: <FolderOpen /> },
        { value: 'download', label: 'Download SVG', icon: <Download /> },
        {
          value: 'export-python',
          label: 'Export Python script…',
          icon: <FileCode />,
        },
        { value: 'export-r', label: 'Export R script…', icon: <FileText /> },
        { value: 'details', label: 'Document details…', icon: <Settings2 /> },
      ],
    },
  ];

  return (
    // Full-window overlay that centres the toolbar along the bottom while letting
    // pointer events fall through to the canvas everywhere except the toolbar.
    <div className="pointer-events-none absolute inset-0 z-20 flex items-end justify-center pb-6">
      <SegmentedToolbar
        label="Editor toolbar"
        items={items}
        orientation="horizontal"
        size="md"
        draggable
        className="pointer-events-auto"
      />
    </div>
  );
}
