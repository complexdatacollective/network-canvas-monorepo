import { afterEach, describe, expect, it } from 'vitest';

import { registerBeforeUnloadGuard } from '../beforeUnloadGuard';

const cleanups: Array<() => void> = [];

function beforeUnloadEvent(): BeforeUnloadEvent {
  return new Event('beforeunload', {
    cancelable: true,
  }) as BeforeUnloadEvent;
}

afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
});

describe('registerBeforeUnloadGuard', () => {
  it('allows a clean document to unload without prompting', () => {
    cleanups.push(registerBeforeUnloadGuard(() => false));
    const event = beforeUnloadEvent();

    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });

  it('prevents unload while the document has unsaved changes', () => {
    let dirty = false;
    cleanups.push(registerBeforeUnloadGuard(() => dirty));

    const cleanEvent = beforeUnloadEvent();
    window.dispatchEvent(cleanEvent);
    expect(cleanEvent.defaultPrevented).toBe(false);

    dirty = true;
    const dirtyEvent = beforeUnloadEvent();
    window.dispatchEvent(dirtyEvent);
    expect(dirtyEvent.defaultPrevented).toBe(true);
  });

  it('removes the warning listener during cleanup', () => {
    const cleanup = registerBeforeUnloadGuard(() => true);
    cleanup();

    const event = beforeUnloadEvent();
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });
});
