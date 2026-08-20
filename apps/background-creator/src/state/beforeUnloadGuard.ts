// Registers the browser-native leave-site warning only when the supplied
// predicate reports unsaved changes. Browsers intentionally control the prompt
// wording; preventDefault + returnValue is the interoperable trigger.
export function registerBeforeUnloadGuard(isDirty: () => boolean): () => void {
  const handleBeforeUnload = (event: BeforeUnloadEvent): void => {
    if (!isDirty()) return;
    event.preventDefault();
    event.returnValue = '';
  };

  window.addEventListener('beforeunload', handleBeforeUnload);
  return () => window.removeEventListener('beforeunload', handleBeforeUnload);
}
