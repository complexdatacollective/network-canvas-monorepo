import {
  Circle,
  CircleDashed,
  Download,
  Eye,
  EyeOff,
  FileCode,
  FilePlus,
  FileText,
  FolderOpen,
  Hexagon,
  Minus,
  Monitor,
  MousePointer2,
  Pentagon,
  Settings2,
  SlidersHorizontal,
  Square,
  SquareDashed,
  Type,
  Undo2,
  Redo2,
} from 'lucide-react';
import { type ReactElement, useState } from 'react';

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
const ZONE_TOOLS: EditorTool[] = ['zone-rect', 'zone-circle', 'zone-polygon'];
const ALL_TOOLS: EditorTool[] = [...DRAW_TOOLS, ...ZONE_TOOLS];

// The single-select toggle group hands back a string array; recover the typed
// tool without an assertion by matching the known tool list.
function toEditorTool(value: string | undefined): EditorTool | null {
  return ALL_TOOLS.find((tool) => tool === value) ?? null;
}

function selectedFor(tools: EditorTool[], active: EditorTool): string[] {
  return tools.includes(active) ? [active] : [];
}

// Zone tools share a tint (info-coloured icons) so they read as a distinct group
// from the drawing tools; the pressed highlight (text-selected-contrast) wins
// over it, so there is no colour conflict on the active segment.
const ZONE_TINT = 'text-info';

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
      value: selectedFor(DRAW_TOOLS, activeTool),
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
      type: 'group',
      id: 'zone-tools',
      mode: 'single',
      value: selectedFor(ZONE_TOOLS, activeTool),
      onValueChange: handleToolChange,
      options: [
        {
          value: 'zone-rect',
          label: 'Rectangle zone',
          icon: <SquareDashed />,
          className: ZONE_TINT,
        },
        {
          value: 'zone-circle',
          label: 'Circle zone',
          icon: <CircleDashed />,
          className: ZONE_TINT,
        },
        {
          value: 'zone-polygon',
          label: 'Polygon zone',
          icon: <Hexagon />,
          className: ZONE_TINT,
        },
      ],
    },
    { type: 'separator', id: 'sep-zones' },
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
      open: propertiesOpen,
      onOpenChange: setPropertiesOpen,
      pressed: propertiesOpen || selection !== null,
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
