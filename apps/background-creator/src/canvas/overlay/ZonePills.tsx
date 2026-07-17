import type { CSSProperties, ReactElement } from 'react';

import { zonesOf } from '~/geometry/zones';
import { elementBounds } from '~/state/documentGeometry';
import { useEditorStore } from '~/state/editorStore';

import { ZONE_PILL_ATTR } from '../overlayTargets';

// Visible label pill for every zone-marked element. Pills are editor-only chrome
// (aria-hidden and out of the tab order — the element's KeyboardTarget is its
// accessible control), placed at the shape's top inner edge so nested concentric
// rings, which share a centre, don't stack their pills. Pills only capture the
// pointer under the select tool, so drawing passes through them; the stage
// yields to `[data-zone-pill]` so a pill press (click or drag) selects the zone
// instead of starting a stage move, and the `data-zone-id` marker lets the
// canvas' double-click handler open that zone's label editor.
export function ZonePills(): ReactElement | null {
  const doc = useEditorStore((s) => s.doc);
  const zonesVisible = useEditorStore((s) => s.zonesVisible);
  const selection = useEditorStore((s) => s.selection);
  const activeTool = useEditorStore((s) => s.activeTool);
  const select = useEditorStore((s) => s.select);

  if (!zonesVisible) return null;
  const interactive = activeTool === 'select';

  return (
    <div className="pointer-events-none absolute inset-0">
      {zonesOf(doc).map((zone) => {
        const bounds = elementBounds(zone);
        const centreX = (bounds.minX + bounds.maxX) / 2;
        const selected = selection?.id === zone.id;
        const label =
          zone.zoneLabel === null || zone.zoneLabel.trim() === ''
            ? 'unlabelled'
            : zone.zoneLabel;
        const style: CSSProperties = {
          left: `${centreX * 100}%`,
          top: `${bounds.minY * 100}%`,
          transform: 'translate(-50%, 4px)',
          pointerEvents: interactive ? 'auto' : 'none',
        };
        return (
          <button
            key={zone.id}
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            data-zone-id={zone.id}
            {...{ [ZONE_PILL_ATTR]: '' }}
            className={`elevation-low absolute max-w-[40%] truncate rounded-full border px-2 py-0.5 text-xs ${
              selected
                ? 'border-selected bg-selected text-selected-contrast'
                : 'border-outline bg-surface text-surface-contrast'
            }`}
            style={style}
            onClick={() => select({ id: zone.id })}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
