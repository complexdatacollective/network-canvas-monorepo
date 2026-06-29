import { describe, expect, it } from 'vitest';

import { createUndoStore } from '../useUndoStore';

const cmd = (log: string[], name: string) => ({
  label: name,
  undo: () => log.push(`undo:${name}`),
  redo: () => log.push(`redo:${name}`),
});

describe('createUndoStore', () => {
  it('starts empty', () => {
    const s = createUndoStore().getState();
    expect(s.past).toHaveLength(0);
    expect(s.future).toHaveLength(0);
  });

  it('push records a command and clears redo future', async () => {
    const store = createUndoStore();
    const log: string[] = [];
    store.getState().push(cmd(log, 'a'));
    await store.getState().undo();
    store.getState().push(cmd(log, 'b'));
    expect(store.getState().future).toHaveLength(0);
  });

  it('undo then redo calls the command hooks in order', async () => {
    const store = createUndoStore();
    const log: string[] = [];
    store.getState().push(cmd(log, 'a'));
    await store.getState().undo();
    await store.getState().redo();
    expect(log).toEqual(['undo:a', 'redo:a']);
  });

  it('is a no-op when there is nothing to undo/redo', async () => {
    const store = createUndoStore();
    await expect(store.getState().undo()).resolves.toBeUndefined();
    await expect(store.getState().redo()).resolves.toBeUndefined();
  });

  it('trims the past to the limit (oldest dropped)', () => {
    const store = createUndoStore(2);
    const log: string[] = [];
    store.getState().push(cmd(log, 'a'));
    store.getState().push(cmd(log, 'b'));
    store.getState().push(cmd(log, 'c'));
    expect(store.getState().past.map((c) => c.label)).toEqual(['b', 'c']);
  });
});
