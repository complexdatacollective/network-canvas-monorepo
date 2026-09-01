// Commits the currently focused property field before a canvas gesture starts.
// Fresco NumberField/InputField controls publish their pending value from the
// native blur handler, so this completes synchronously before the gesture takes
// its document snapshot.
export function flushFocusedField(): void {
  const active = document.activeElement;
  if (
    active instanceof HTMLInputElement ||
    active instanceof HTMLTextAreaElement ||
    active instanceof HTMLSelectElement
  ) {
    active.blur();
  }
}
