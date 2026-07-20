import { SlidersHorizontal } from 'lucide-react';
import {
  type CSSProperties,
  type ReactElement,
  type RefObject,
  useEffect,
  useState,
} from 'react';

import { IconButton } from '@codaco/fresco-ui/Button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@codaco/fresco-ui/Popover';
import { elementBounds } from '~/state/documentGeometry';
import { useEditorStore } from '~/state/editorStore';
import { PropertiesPanel } from '~/toolbar/PropertiesPanel';

import { PROPERTIES_TRIGGER_ATTR } from '../overlayTargets';

// Selection-anchored entry point to the element properties: a small trigger
// floated just past the selection's bottom-right corner, opening the same
// PropertiesPanel the toolbar's Properties popover hosts (that button remains
// the keyboard-discoverable path). The stage yields to
// `[data-properties-trigger]` (see overlayTargets) so pressing the trigger
// never starts a stage gesture, and Base UI's dismiss-on-outside-press closes
// the popup when a drag or another selection press lands on the stage.
export function SelectionProperties({
  stageRef,
}: {
  stageRef: RefObject<HTMLDivElement | null>;
}): ReactElement | null {
  const selection = useEditorStore((s) => s.selection);
  const activeTool = useEditorStore((s) => s.activeTool);
  const doc = useEditorStore((s) => s.doc);

  const [open, setOpen] = useState(false);
  const selectedId = selection?.id ?? null;
  // Keyboard-driven selection changes never press outside the popup, so close
  // explicitly whenever the selected element changes (clearing unmounts below).
  // If the popup held focus when its element vanished — Delete pressed inside
  // the panel — the whole popover unmounts and focus falls to <body>; hand it
  // to the stage instead so the keyboard user is not stranded at the top of
  // the document.
  useEffect(() => {
    setOpen(false);
    if (document.activeElement === document.body) stageRef.current?.focus();
  }, [selectedId, stageRef]);

  if (activeTool !== 'select' || !selection) return null;
  const el = doc.elements.find((e) => e.id === selection.id);
  if (!el) return null;
  const bounds = elementBounds(el);

  // Preferred spot: below-right of the bounds, past the ~20px corner-handle hit
  // target centred on the corner (see ResizeHandles); the zone pill sits at the
  // top edge, well clear of this corner. Clamped to stay inside the stage —
  // the letterbox container clips (overflow-hidden), so a full-bleed element's
  // corner would otherwise push the trigger off-screen entirely. The clamped
  // fallback (48px inset) tucks the button just inside the bounds, still clear
  // of the corner handle.
  const style: CSSProperties = {
    left: `clamp(4px, calc(${bounds.maxX * 100}% + 12px), calc(100% - 48px))`,
    top: `clamp(4px, calc(${bounds.maxY * 100}% + 12px), calc(100% - 48px))`,
  };

  return (
    <div className="pointer-events-none absolute inset-0">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <IconButton
              icon={<SlidersHorizontal />}
              aria-label="Element properties"
              size="sm"
              {...{ [PROPERTIES_TRIGGER_ATTR]: '' }}
              className="pointer-events-auto absolute"
              style={style}
            />
          }
        />
        <PopoverContent>
          <PropertiesPanel />
        </PopoverContent>
      </Popover>
    </div>
  );
}
