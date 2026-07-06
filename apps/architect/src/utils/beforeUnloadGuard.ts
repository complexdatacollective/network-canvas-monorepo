// Warns before the tab closes while a protocol exists only in memory (the
// storage-unavailable fallback, e.g. Safari private browsing). Nothing is
// persisted in that mode, so closing the tab silently loses all work. The
// listener is attached only while the guard is armed so it never blocks unload
// during normal (persisted) editing.

let armed = false;

const handleBeforeUnload = (event: BeforeUnloadEvent): void => {
  // Setting returnValue triggers the browser's native "leave site?" prompt; the
  // string is legacy and ignored by modern browsers.
  event.preventDefault();
  event.returnValue = '';
};

export const armInMemoryUnloadGuard = (): void => {
  if (armed || typeof window === 'undefined') {
    return;
  }
  armed = true;
  window.addEventListener('beforeunload', handleBeforeUnload);
};

export const disarmInMemoryUnloadGuard = (): void => {
  if (!armed || typeof window === 'undefined') {
    return;
  }
  armed = false;
  window.removeEventListener('beforeunload', handleBeforeUnload);
};
