import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
  useEffect,
  useRef,
  useState,
} from 'react';

import type { TextElement } from '~/model/types';
import type { StageBox } from '~/state/documentGeometry';
import { linesToText } from '~/toolbar/textLines';

import { INLINE_EDITOR_ATTR } from './overlayTargets';

// The rendered font size of a text element on the current stage: the SVG's
// `clamp(min, <vmin>vmin, max)` resolved against the stage box (vmin = 1% of the
// smaller stage dimension), so the in-place editor matches what the preview img
// paints.
function fontPxFor(el: TextElement, stage: StageBox): number {
  const vmin = (el.fontVmin / 100) * Math.min(stage.width, stage.height);
  return Math.min(Math.max(vmin, el.fontMinPx), el.fontMaxPx);
}

function anchorTranslateX(anchor: TextElement['anchor']): string {
  if (anchor === 'start') return '0';
  if (anchor === 'end') return '-100%';
  return '-50%';
}

function anchorTextAlign(
  anchor: TextElement['anchor'],
): CSSProperties['textAlign'] {
  if (anchor === 'start') return 'left';
  if (anchor === 'end') return 'right';
  return 'center';
}

// In-place editor for a text element, positioned over the preview at the text's
// anchor and matching its alignment and rendered font size. Enter inserts a
// newline; Escape or blur commits (the parent decides whether an empty new
// placeholder is removed instead). While it is mounted, the parent omits this
// element from the serialized preview so there is no double render.
export function InlineTextEditor({
  element,
  stage,
  isNew,
  onCommit,
}: {
  element: TextElement;
  stage: StageBox;
  isNew: boolean;
  onCommit: (value: string) => void;
}): ReactElement {
  const [value, setValue] = useState(() => linesToText(element.lines));
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const committedRef = useRef(false);

  const commit = () => {
    if (committedRef.current) return;
    committedRef.current = true;
    onCommit(value);
  };

  // Move focus into the editor on open; a freshly-placed placeholder selects its
  // text so the first keystroke overwrites it, an existing edit lands the caret
  // at the end.
  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.focus();
    if (isNew) node.select();
    else node.setSelectionRange(node.value.length, node.value.length);
  }, [isNew]);

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      commit();
    }
    // Enter falls through to the textarea's default newline insertion.
  };

  const px = fontPxFor(element, stage);
  const style: CSSProperties = {
    left: `${element.x * 100}%`,
    top: `${element.y * 100}%`,
    transform: `translate(${anchorTranslateX(element.anchor)}, -50%)`,
    fontSize: `${px}px`,
    lineHeight: 1.2,
    fontWeight: element.fontWeight,
    color: element.fill,
    textAlign: anchorTextAlign(element.anchor),
    width: 'min(24rem, 60%)',
  };

  return (
    <textarea
      ref={textareaRef}
      aria-label="Edit text"
      {...{ [INLINE_EDITOR_ATTR]: '' }}
      value={value}
      rows={Math.max(value.split('\n').length, 1)}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={commit}
      spellCheck={false}
      className="focusable border-selected bg-surface/90 elevation-medium absolute resize-none overflow-hidden rounded-sm border px-1 py-0.5 font-[system-ui]"
      style={style}
    />
  );
}
