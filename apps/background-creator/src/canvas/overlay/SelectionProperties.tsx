import { SlidersHorizontal } from 'lucide-react';
import {
  type CSSProperties,
  type ReactElement,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from 'react';

import { IconButton } from '@codaco/fresco-ui/Button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@codaco/fresco-ui/Popover';
import { elementBounds, type StageBox } from '~/state/documentGeometry';
import { useEditorStore } from '~/state/editorStore';
import { PropertiesPanel } from '~/toolbar/PropertiesPanel';

import { PROPERTIES_TRIGGER_ATTR } from '../overlayTargets';

// Selection-anchored entry point to the element properties: a filled accent
// trigger floated just past the selection's bottom-right corner, opening the same
// PropertiesPanel the toolbar's Properties popover hosts (that button remains
// the keyboard-discoverable path). The stage yields to
// `[data-properties-trigger]` (see overlayTargets) so pressing the trigger
// never starts a stage gesture, and Base UI's dismiss-on-outside-press closes
// the popup when a drag or another selection press lands on the stage.
export function SelectionProperties({
  stage,
  stageRef,
}: {
  stage: StageBox | null;
  stageRef: RefObject<HTMLDivElement | null>;
}): ReactElement | null {
  const selection = useEditorStore((s) => s.selection);
  const activeTool = useEditorStore((s) => s.activeTool);
  const doc = useEditorStore((s) => s.doc);

  const selectedId = selection?.id ?? null;

  // The popup is bound to the element it was opened for, so `open` is DERIVED,
  // not free state: it is true only while the current selection is still that
  // element. Selecting another item therefore renders the popup closed in the
  // same pass — it never paints re-anchored to the new element (the flash a
  // plain `open` boolean + effect would allow), and it never lingers on it.
  // Re-opening for the new element is an explicit press of the (larger) trigger.
  const [openForId, setOpenForId] = useState<string | null>(null);
  const open = openForId !== null && openForId === selectedId;
  const setOpen = (next: boolean) => setOpenForId(next ? selectedId : null);

  // If the popup held focus when its element vanished — Delete pressed inside
  // the panel — the whole popover unmounts and focus falls to <body>; hand it
  // to the stage instead so the keyboard user is not stranded at the top of
  // the document. Fire only on a real→null transition: on initial mount (or any
  // reselection) there is no focus to rescue, and grabbing focus on page load
  // would yank keyboard and screen-reader users into the canvas uninvited.
  const hadSelectionRef = useRef(false);
  useEffect(() => {
    const hadSelection = hadSelectionRef.current;
    hadSelectionRef.current = selectedId !== null;
    if (selectedId === null) {
      // Drop the open binding when the selection clears (including a Delete
      // pressed inside the panel, which is not an outside-press so no managed
      // close runs). Otherwise a stale openForId could re-match a later
      // selection of the same id — e.g. delete-then-undo restores the element —
      // and the panel would reopen without an explicit trigger press.
      setOpenForId(null);
      if (hadSelection && document.activeElement === document.body) {
        stageRef.current?.focus();
      }
    }
  }, [selectedId, stageRef]);

  if (activeTool !== 'select' || !selection) return null;
  const el = doc.elements.find((e) => e.id === selection.id);
  if (!el) return null;
  const bounds = elementBounds(el, stage);

  // Preferred spot: below-right of the bounds, past the ~20px corner-handle hit
  // target centred on the corner (see ResizeHandles); the zone pill sits at the
  // top edge, well clear of this corner. Clamped to stay inside the stage —
  // the letterbox container clips (overflow-hidden), so a full-bleed element's
  // corner would otherwise push the trigger off-screen entirely. The clamped
  // fallback (88px inset — the 80px xl button plus an 8px edge margin) tucks the
  // button fully inside the bounds, still clear of the corner handle.
  const style: CSSProperties = {
    left: `clamp(4px, calc(${bounds.maxX * 100}% + 12px), calc(100% - 88px))`,
    top: `clamp(4px, calc(${bounds.maxY * 100}% + 12px), calc(100% - 88px))`,
  };

  return (
    <div className="pointer-events-none absolute inset-0">
      {/* Keyed on the selected element so a reselect UNMOUNTS the old popover
          atomically instead of letting its AnimatePresence exit-animation play
          — otherwise the closing panel briefly fades out re-anchored to the
          newly selected element. Same-element close (trigger toggle, Escape,
          outside press) keeps its key, so its exit fade still plays. */}
      <Popover key={selectedId} open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <IconButton
              icon={<SlidersHorizontal />}
              aria-label="Element properties"
              size="xl"
              color="accent"
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
