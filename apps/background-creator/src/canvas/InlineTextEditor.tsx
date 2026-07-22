import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
  useEffect,
  useRef,
  useState,
} from 'react';

import { resolvePaint } from '~/model/paint';
import type { TextElement } from '~/model/types';
import {
  type StageBox,
  TEXT_LINE_HEIGHT_EM,
  textFontPx,
} from '~/state/documentGeometry';
import { measureWidestLinePx, textCanvasFont } from '~/state/textMeasure';
import { linesToText } from '~/toolbar/textLines';

import { INLINE_EDITOR_ATTR } from './overlayTargets';

// Slack added to the measured content width so the caret at the end of the
// longest line has room and sub-pixel rounding never scrolls a line. Symmetric
// around the centred content, so glyphs stay on their rendered positions.
const CARET_SLACK_PX = 2;

// Per-character width estimate used only when no canvas 2D context exists
// (jsdom); real browsers always measure.
const FALLBACK_CHAR_EM = 0.6;

// In-place editor for a text element: a chrome-free textarea styled identically
// to the rendered SVG text (font, resolved clamp() size, weight, line height,
// centre alignment, theme-resolved colour) and sized to its content, centred on
// the element's (x, y) — so double-clicking reads as the text itself becoming
// editable, with the caret and native selection as the only affordance. Enter
// inserts a newline; Escape or blur commits (the parent decides whether an
// empty new placeholder is removed instead). The parent is asked to restore
// stage focus only when focus is not headed to another control — Escape, or a
// blur whose relatedTarget is null (e.g. a Firefox canvas click, which focuses
// body rather than the stage ancestor). A blur into a real control (Tab to the
// toolbar, clicking a panel field) must not have focus stolen back. While the
// editor is mounted, the parent omits this element from the serialized preview
// so there is no double render.
export function InlineTextEditor({
  element,
  stage,
  isNew,
  onCommit,
}: {
  element: TextElement;
  stage: StageBox;
  isNew: boolean;
  onCommit: (value: string, restoreFocus: boolean) => void;
}): ReactElement {
  const [value, setValue] = useState(() => linesToText(element.lines));
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const committedRef = useRef(false);

  const commit = (restoreFocus: boolean) => {
    if (committedRef.current) return;
    committedRef.current = true;
    onCommit(value, restoreFocus);
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
      commit(true);
    }
    // Enter falls through to the textarea's default newline insertion.
  };

  // Auto-grow with the live value: width follows the widest line (measured with
  // the same font the SVG renders), height follows the line count.
  const px = textFontPx(element, stage);
  const lines = value.split('\n');
  const longest = lines.reduce((max, line) => Math.max(max, line.length), 0);
  const widestPx =
    measureWidestLinePx(lines, textCanvasFont(element.fontWeight, px)) ??
    longest * FALLBACK_CHAR_EM * px;
  const style: CSSProperties = {
    left: `${element.x * 100}%`,
    top: `${element.y * 100}%`,
    transform: 'translate(-50%, -50%)',
    width: `${widestPx + CARET_SLACK_PX}px`,
    height: `${lines.length * TEXT_LINE_HEIGHT_EM * px}px`,
    fontFamily: 'system-ui, sans-serif',
    fontSize: `${px}px`,
    lineHeight: TEXT_LINE_HEIGHT_EM,
    fontWeight: element.fontWeight,
    color: resolvePaint(element.fill),
    // Always-visible caret: the seamless editor has no box chrome, so when the
    // text colour matches the backdrop the caret is the only sign an editing
    // session is live. The selection token contrasts with artwork on every
    // preview surface.
    caretColor: 'var(--selected)',
    textAlign: 'center',
  };

  return (
    <textarea
      ref={textareaRef}
      aria-label="Edit text"
      {...{ [INLINE_EDITOR_ATTR]: '' }}
      value={value}
      wrap="off"
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={(e) => commit(e.relatedTarget === null)}
      spellCheck={false}
      className="absolute resize-none overflow-hidden border-0 bg-transparent p-0 outline-none"
      style={style}
    />
  );
}
