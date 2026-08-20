import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { hasDirtyNestedDraft, useNestedDraft } from '../nestedDraftRegistry';

const fireBeforeUnload = () => {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event;
};

describe('nested draft registry', () => {
  it('reports nothing dirty when no editor is open', () => {
    expect(hasDirtyNestedDraft()).toBe(false);
  });

  it('only counts an editor while it is registered as open', () => {
    const { rerender, unmount } = renderHook(
      ({ open }: { open: boolean }) => useNestedDraft(open, () => true),
      { initialProps: { open: false } },
    );

    expect(hasDirtyNestedDraft()).toBe(false);

    rerender({ open: true });
    expect(hasDirtyNestedDraft()).toBe(true);

    rerender({ open: false });
    expect(hasDirtyNestedDraft()).toBe(false);

    rerender({ open: true });
    unmount();
    expect(hasDirtyNestedDraft()).toBe(false);
  });

  it('asks the predicate at question time rather than sampling it', () => {
    let dirty = false;
    renderHook(() => useNestedDraft(true, () => dirty));

    expect(hasDirtyNestedDraft()).toBe(false);
    dirty = true;
    expect(hasDirtyNestedDraft()).toBe(true);
  });

  it('is dirty when ANY open editor is dirty', () => {
    const clean = renderHook(() => useNestedDraft(true, () => false));
    const dirty = renderHook(() => useNestedDraft(true, () => true));

    expect(hasDirtyNestedDraft()).toBe(true);

    dirty.unmount();
    expect(hasDirtyNestedDraft()).toBe(false);
    clean.unmount();
  });

  it('guards a refresh while a dirty editor is open, and only then', () => {
    // The stage editor's own `beforeunload` is scoped to its mount and reads
    // the stage form's mirror, which a nested editor never writes to. Without
    // this listener a half-typed Hint — or anything in the Codebook or
    // Resources editors, which the stage guard never sees at all — is discarded
    // by a refresh with no prompt.
    expect(fireBeforeUnload().defaultPrevented).toBe(false);

    let dirty = false;
    const editor = renderHook(() => useNestedDraft(true, () => dirty));

    expect(fireBeforeUnload().defaultPrevented).toBe(false);

    dirty = true;
    expect(fireBeforeUnload().defaultPrevented).toBe(true);

    editor.unmount();
    expect(fireBeforeUnload().defaultPrevented).toBe(false);
  });
});
