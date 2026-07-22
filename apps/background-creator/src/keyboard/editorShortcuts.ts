// Keyboard-shortcut policy for the editor, split out from the App component so
// the focus-scoping rules can be unit-tested without rendering the canvas.

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}

// True when focus is on the canvas surface (the stage or its focusable item
// controls, all under role="application") or on the body — i.e. not on the
// toolbar, the properties popover, a dialog, or a menu. The history and delete
// shortcuts only act in this context; anywhere else the key belongs to whatever
// control has focus, so acting would mutate the design behind an overlay.
function isCanvasFocusContext(target: EventTarget | null): boolean {
  if (target === document.body) return true;
  return (
    target instanceof HTMLElement &&
    target.closest('[role="application"]') !== null
  );
}

export type EditorKeyAction = 'undo' | 'redo' | 'delete' | null;

// The event fields the policy reads; a real KeyboardEvent satisfies this, and a
// test can supply a plain object with a synthetic focus target.
type KeyGesture = Pick<
  KeyboardEvent,
  'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'target'
>;

// Resolves a keydown to the editor action it should trigger, or null. Both the
// bare Delete/Backspace and the Ctrl/Cmd+Z / Ctrl/Cmd+Y history shortcuts are
// scoped to canvas focus: while a dialog, menu, toolbar control, or properties
// popover holds focus, the key belongs to that control — never to the canvas
// behind it.
export function resolveEditorKeyAction(e: KeyGesture): EditorKeyAction {
  // Don't hijack shortcuts while the user is typing in a field.
  if (isEditableTarget(e.target)) return null;

  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (e.metaKey || e.ctrlKey || e.altKey) return null;
    if (!isCanvasFocusContext(e.target)) return null;
    return 'delete';
  }

  if (!(e.metaKey || e.ctrlKey)) return null;
  if (!isCanvasFocusContext(e.target)) return null;
  const key = e.key.toLowerCase();
  if (key === 'z') return e.shiftKey ? 'redo' : 'undo';
  if (key === 'y') return 'redo';
  return null;
}
