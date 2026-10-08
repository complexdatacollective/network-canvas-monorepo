import { describe, expect, it } from 'vitest';

import { createUndoStore } from '../useUndoStore';

const cmd = (log: string[], name: string) => ({
  label: name,
  undo: () => {
    log.push(`undo:${name}`);
  },
  redo: () => {
    log.push(`redo:${name}`);
  },
});

describe('createUndoStore', () => {
  it('starts empty', () => {
    const s = createUndoStore().getState();
    expect(s.past).toHaveLength(0);
    expect(s.future).toHaveLength(0);
  });

  it('record adds a command and clears redo future', async () => {
    const store = createUndoStore();
    const log: string[] = [];
    await store.getState().record(async () => cmd(log, 'a'));
    await store.getState().undo();
    await store.getState().record(async () => cmd(log, 'b'));
    expect(store.getState().future).toHaveLength(0);
  });

  it('undo then redo calls the command hooks in order', async () => {
    const store = createUndoStore();
    const log: string[] = [];
    await store.getState().record(async () => cmd(log, 'a'));
    await store.getState().undo();
    await store.getState().redo();
    expect(log).toEqual(['undo:a', 'redo:a']);
  });

  it('is a no-op when there is nothing to undo/redo', async () => {
    const store = createUndoStore();
    await expect(store.getState().undo()).resolves.toBeUndefined();
    await expect(store.getState().redo()).resolves.toBeUndefined();
  });

  it('trims the past to the limit (oldest dropped)', async () => {
    const store = createUndoStore(2);
    const log: string[] = [];
    await store.getState().record(async () => cmd(log, 'a'));
    await store.getState().record(async () => cmd(log, 'b'));
    await store.getState().record(async () => cmd(log, 'c'));
    expect(store.getState().past.map((c) => c.label)).toEqual(['b', 'c']);
  });

  it('undoes a step of joined edits latest first, and redoes them in order', async () => {
    const store = createUndoStore();
    const log: string[] = [];
    await store
      .getState()
      .record(async () => ({ ...cmd(log, 'a'), coalesceKey: 'k' }));
    await store
      .getState()
      .record(async () => ({ ...cmd(log, 'b'), coalesceKey: 'k' }));
    expect(store.getState().past).toHaveLength(1);

    await store.getState().undo();
    expect(log).toEqual(['undo:b', 'undo:a']);
    await store.getState().redo();
    expect(log).toEqual(['undo:b', 'undo:a', 'redo:a', 'redo:b']);
  });
});

describe('createUndoStore record', () => {
  const deferred = () => {
    let resolve: () => void = () => undefined;
    const promise = new Promise<void>((done) => {
      resolve = done;
    });
    return { promise, resolve };
  };

  it('applies an undo asked for while a change is being made to that change', async () => {
    const store = createUndoStore();
    const log: string[] = [];
    const change = deferred();

    const recording = store.getState().record(async () => {
      await change.promise;
      return cmd(log, 'a');
    });
    const undoing = store.getState().undo();
    change.resolve();
    await Promise.all([recording, undoing]);

    expect(log).toEqual(['undo:a']);
    expect(store.getState().future.map((c) => c.label)).toEqual(['a']);
  });

  it('makes a change asked for while an undo is being made once the undo is done', async () => {
    const store = createUndoStore();
    const log: string[] = [];
    const undone = deferred();
    await store.getState().record(async () => ({
      ...cmd(log, 'a'),
      undo: async () => {
        await undone.promise;
        log.push('undo:a');
      },
    }));

    const undoing = store.getState().undo();
    const recording = store.getState().record(async () => {
      log.push('change');
      return null;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(log).toEqual([]);

    undone.resolve();
    await Promise.all([undoing, recording]);
    expect(log).toEqual(['undo:a', 'change']);
  });

  it('keeps what can be redone when a change changes nothing', async () => {
    const store = createUndoStore();
    const log: string[] = [];
    await store.getState().record(async () => cmd(log, 'a'));
    await store.getState().undo();

    await store.getState().record(async () => null);
    expect(store.getState().past).toHaveLength(0);
    expect(store.getState().future.map((c) => c.label)).toEqual(['a']);
  });

  it('records nothing for a change that fails, and goes on to the next', async () => {
    const store = createUndoStore();
    const log: string[] = [];

    await expect(
      store.getState().record(async () => {
        throw new Error('refused');
      }),
    ).rejects.toThrow('refused');
    await store.getState().record(async () => cmd(log, 'b'));
    expect(store.getState().past.map((c) => c.label)).toEqual(['b']);
  });
});
