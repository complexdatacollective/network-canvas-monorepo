import type { CSSProperties, ReactElement } from 'react';

import { useEditorStore } from '~/state/editorStore';
import { zoneAriaLabel } from '~/state/labels';

import { zoneCentroid } from '../canvasGeometry';
import { useItemControls } from './useItemControls';

// Visible label pill at each zone's centroid. Doubles as the zone's focusable
// keyboard control (zones are only interactive while visible). Pills only capture
// the pointer under the select tool, so drawing can pass through them.
export function ZonePills(): ReactElement | null {
  const zones = useEditorStore((s) => s.doc.zones);
  const zonesVisible = useEditorStore((s) => s.zonesVisible);
  const selection = useEditorStore((s) => s.selection);
  const activeTool = useEditorStore((s) => s.activeTool);
  const select = useEditorStore((s) => s.select);
  const { onKeyDown, onKeyUp } = useItemControls();

  if (!zonesVisible) return null;
  const interactive = activeTool === 'select';

  return (
    <div className="pointer-events-none absolute inset-0">
      {zones.map((zone) => {
        const centre = zoneCentroid(zone);
        const selected = selection?.type === 'zone' && selection.id === zone.id;
        const style: CSSProperties = {
          left: `${centre.x * 100}%`,
          top: `${centre.y * 100}%`,
          transform: 'translate(-50%, -50%)',
          pointerEvents: interactive ? 'auto' : 'none',
        };
        return (
          <button
            key={zone.id}
            type="button"
            aria-label={zoneAriaLabel(zone)}
            aria-pressed={selected}
            className={`focusable elevation-low absolute max-w-[40%] truncate rounded-full border px-2 py-0.5 text-xs ${
              selected
                ? 'border-selected bg-selected text-selected-contrast'
                : 'border-outline bg-surface text-surface-contrast'
            }`}
            style={style}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => select({ id: zone.id, type: 'zone' })}
            onFocus={() => select({ id: zone.id, type: 'zone' })}
            onKeyDown={onKeyDown}
            onKeyUp={onKeyUp}
          >
            {zone.label.trim() === '' ? 'unlabelled' : zone.label}
          </button>
        );
      })}
    </div>
  );
}
