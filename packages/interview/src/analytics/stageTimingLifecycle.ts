import type { Store } from '@reduxjs/toolkit';

type StageTimingLifecycle = {
  abandon: () => void;
  resume: () => void;
};

const handlers = new WeakMap<Store, StageTimingLifecycle>();

export function registerStageTimingLifecycle(
  store: Store,
  lifecycle: StageTimingLifecycle,
): () => void {
  handlers.set(store, lifecycle);
  return () => {
    if (handlers.get(store) === lifecycle) handlers.delete(store);
  };
}

export function abandonStageTimingBeforeFlush(store: Store): void {
  handlers.get(store)?.abandon();
}

export function resumeStageTimingAfterVisibility(store: Store): void {
  handlers.get(store)?.resume();
}
