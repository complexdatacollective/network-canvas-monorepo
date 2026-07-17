import type { CSSProperties, ReactElement } from 'react';

import type { SvgElement } from '~/model/types';
import { elementBounds } from '~/state/documentGeometry';
import { useEditorStore } from '~/state/editorStore';
import { elementKindLabel, isZoneElement, zoneAriaLabel } from '~/state/labels';

import { useItemControls } from './useItemControls';

// One focusable control per element, positioned over its bounds and in paint
// order, so every shape is reachable and editable by keyboard (Tab to it, arrows
// nudge, Delete removes, Enter opens its editor). The controls are transparent
// and pointer-events-none — they never intercept drawing — but keep a visible
// focus ring. `onActivate` is invoked for the focused element on Enter/Space.
export function KeyboardTargets({
  onActivate,
}: {
  onActivate: (el: SvgElement) => void;
}): ReactElement {
  const elements = useEditorStore((s) => s.doc.elements);
  const selection = useEditorStore((s) => s.selection);
  const select = useEditorStore((s) => s.select);

  const activate = () => {
    const { selection: sel, doc } = useEditorStore.getState();
    if (!sel) return;
    const el = doc.elements.find((candidate) => candidate.id === sel.id);
    if (el) onActivate(el);
  };
  const { onKeyDown, onKeyUp } = useItemControls(activate);

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
        const selected = selection?.id === el.id;
        const name = isZoneElement(el)
          ? zoneAriaLabel(el)
          : elementKindLabel(el);
        return (
          <button
            key={el.id}
            type="button"
            aria-label={`${name}, element ${index + 1} of ${elements.length}`}
            aria-pressed={selected}
            className="focusable pointer-events-none absolute min-h-[10px] min-w-[10px] rounded-sm bg-transparent"
            style={style}
            onFocus={() => select({ id: el.id })}
            onKeyDown={onKeyDown}
            onKeyUp={onKeyUp}
          />
        );
      })}
    </div>
  );
}
