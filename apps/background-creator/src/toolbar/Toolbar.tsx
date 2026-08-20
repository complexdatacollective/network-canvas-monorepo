import {
  Circle,
  File,
  FileCode,
  FileOutput,
  FilePenLine,
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
import { DropdownMenuItem } from '@codaco/fresco-ui/DropdownMenu';
import {
  SegmentedToolbar,
  ToolbarGroup,
  ToolbarIconButton,
  ToolbarMenu,
  ToolbarPopover,
  ToolbarSeparator,
  ToolbarToggleGroup,
} from '@codaco/fresco-ui/SegmentedToolbar';
import { type EditorTool, useEditorStore } from '~/state/editorStore';

import {
  downloadSvgFlow,
  editDocumentDetailsFlow,
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
  // While an inline text edit is open, clicking a history button would first
  // blur the editor (committing or discarding the text) and then run undo/redo
  // against the remaining history — two reverts from one click. Disable them for
  // that window, matching the keyboard, where the textarea captures Ctrl/Cmd+Z.
  const isEditingText = useEditorStore((s) => s.isEditingText);

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
      case 'details':
        void editDocumentDetailsFlow(dialogs);
        break;
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
        aria-label="Editor toolbar"
        orientation="horizontal"
        size="md"
        draggable
        dragConstraints={overlayRef}
        className="pointer-events-auto"
      >
        <ToolbarToggleGroup
          aria-label="Drawing tools"
          value={selectedFor(activeTool)}
          onValueChange={handleToolChange}
        >
          <ToolbarIconButton
            value="select"
            aria-label="Select"
            icon={<MousePointer2 />}
          />
          <ToolbarIconButton
            value="rect"
            aria-label="Rectangle"
            icon={<Square />}
          />
          <ToolbarIconButton
            value="ellipse"
            aria-label="Ellipse"
            icon={<Circle />}
          />
          <ToolbarIconButton value="line" aria-label="Line" icon={<Minus />} />
          <ToolbarIconButton
            value="polygon"
            aria-label="Polygon"
            icon={<Pentagon />}
          />
          <ToolbarIconButton value="text" aria-label="Text" icon={<Type />} />
        </ToolbarToggleGroup>

        <ToolbarSeparator />

        <ToolbarGroup aria-label="Display tools">
          <ToolbarIconButton
            aria-label={zonesVisible ? 'Hide zones' : 'Show zones'}
            icon={<Goal />}
            pressed={zonesVisible}
            onPressedChange={() => toggleZonesVisible()}
          />
          <ToolbarPopover
            open={previewOpen}
            onOpenChange={setPreviewOpen}
            contentProps={{ side: 'top' }}
            trigger={
              <ToolbarIconButton
                aria-label="Preview"
                aria-pressed={previewOpen}
                icon={<Proportions />}
              />
            }
          >
            <PreviewPanel />
          </ToolbarPopover>
        </ToolbarGroup>

        <ToolbarSeparator />

        <ToolbarGroup aria-label="History tools">
          <ToolbarIconButton
            aria-label="Undo"
            icon={<Undo2 />}
            disabled={!canUndo || isEditingText}
            onClick={() => undo()}
          />
          <ToolbarIconButton
            aria-label="Redo"
            icon={<Redo2 />}
            disabled={!canRedo || isEditingText}
            onClick={() => redo()}
          />
        </ToolbarGroup>

        <ToolbarSeparator />

        <ToolbarGroup aria-label="Document tools">
          <ToolbarMenu
            contentProps={{ side: 'top' }}
            trigger={<ToolbarIconButton aria-label="New" icon={<FilePlus />} />}
          >
            <DropdownMenuItem
              icon={<File />}
              onClick={() => handleNewSelect('blank')}
            >
              Blank canvas
            </DropdownMenuItem>
            <DropdownMenuItem
              icon={<LayoutGrid />}
              onClick={() => handleNewSelect('quadrants')}
            >
              Quadrants template
            </DropdownMenuItem>
            <DropdownMenuItem
              icon={<Target />}
              onClick={() => handleNewSelect('concentric')}
            >
              Circles template
            </DropdownMenuItem>
          </ToolbarMenu>
          <ToolbarIconButton
            aria-label="Open"
            icon={<FolderOpen />}
            onClick={() => void openSvgFlow(dialogs)}
          />
          <ToolbarMenu
            contentProps={{ side: 'top' }}
            trigger={
              <ToolbarIconButton aria-label="Export" icon={<FileOutput />} />
            }
          >
            <DropdownMenuItem
              icon={<FilePenLine />}
              onClick={() => handleExportSelect('details')}
            >
              Edit document details
            </DropdownMenuItem>
            <DropdownMenuItem
              icon={<ImageDown />}
              onClick={() => handleExportSelect('svg')}
            >
              Download SVG
            </DropdownMenuItem>
            <DropdownMenuItem
              icon={<FileCode />}
              onClick={() => handleExportSelect('r')}
            >
              Export R script
            </DropdownMenuItem>
            <DropdownMenuItem
              icon={<FileCode />}
              onClick={() => handleExportSelect('python')}
            >
              Export Python script
            </DropdownMenuItem>
          </ToolbarMenu>
        </ToolbarGroup>

        <ToolbarSeparator />

        <ToolbarIconButton
          aria-label="Information"
          icon={<Info />}
          onClick={onShowWelcome}
        />
      </SegmentedToolbar>
    </div>
  );
}
