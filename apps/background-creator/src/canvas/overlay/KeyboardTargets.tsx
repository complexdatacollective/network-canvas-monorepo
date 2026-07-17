import type { CSSProperties, ReactElement } from 'react';

import { elementBounds } from '~/state/documentGeometry';
import { useEditorStore } from '~/state/editorStore';
import { elementKindLabel } from '~/state/labels';

import { useItemControls } from './useItemControls';

// One focusable control per element, positioned over its bounds and in paint
// order, so every shape is reachable and editable by keyboard (Tab to it, arrows
// nudge, Delete removes). The controls are transparent and pointer-events-none —
// they never intercept drawing — but keep a visible focus ring.
export function KeyboardTargets(): ReactElement {
  const elements = useEditorStore((s) => s.doc.elements);
  const selection = useEditorStore((s) => s.selection);
  const select = useEditorStore((s) => s.select);
  const { onKeyDown, onKeyUp } = useItemControls();

  return (
    <div className="pointer-events-none absolute inset-0">
      {elements.map((el, index) => {
        const b = elementBounds(el);
        const style: CSSProperties = {
          left: `${b.minX * 100}%`,
          top: `${b.minY * 100}%`,
          width: `${(b.maxX - b.minX) * 100}%`,
          height: `${(b.maxY - b.minY) * 100}%`,
        };
        const selected =
          selection?.type === 'element' && selection.id === el.id;
        return (
          <button
            key={el.id}
            type="button"
            aria-label={`${elementKindLabel(el)}, element ${index + 1} of ${elements.length}`}
            aria-pressed={selected}
            className="focusable pointer-events-none absolute min-h-[10px] min-w-[10px] rounded-sm bg-transparent"
            style={style}
            onFocus={() => select({ id: el.id, type: 'element' })}
            onKeyDown={onKeyDown}
            onKeyUp={onKeyUp}
          />
        );
      })}
    </div>
  );
}
