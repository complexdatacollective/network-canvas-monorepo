import { screen, waitFor } from '@testing-library/react';
import { useEffect, useSyncExternalStore } from 'react';
import { describe, expect, it } from 'vitest';

import SubjectSection from '../../sections/subject-picker/SubjectSection.tsx';
import { fixtureStageId } from '../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import {
  useStageDraftStore,
  type StageDraft,
  type StageDraftStore,
} from '../stageDraftStore.ts';

const NOT_READ = Object.freeze({ subscribe: () => () => undefined });

/** The draft as a host's chrome follows it, and the store it was read from. */
const seen: { store: StageDraftStore | undefined; draft: StageDraft | null } = {
  store: undefined,
  draft: null,
};

function DraftProbe() {
  const store = useStageDraftStore();
  const draft = useSyncExternalStore(
    store?.subscribe ?? NOT_READ.subscribe,
    () => store?.getSnapshot() ?? null,
  );
  useEffect(() => {
    seen.store = store;
    seen.draft = draft;
  }, [store, draft]);
  return null;
}

const openQuickAddStage = () =>
  renderStageEditor({
    stageId: 'name-generator-quick-add-1',
    sections: (
      <>
        <DraftProbe />
        <SubjectSection entity="node" />
      </>
    ),
  });

/** Invents a node type from the subject picker, keeping the stage's own type. */
const inventPlace = async (harness: ReturnType<typeof renderStageEditor>) => {
  await harness.user.click(
    await screen.findByRole('button', { name: 'Create new node type' }),
  );
  await harness.user.type(
    await screen.findByRole('textbox', { name: 'Node type name' }),
    'Place',
  );
  await harness.user.click(screen.getByRole('button', { name: 'Save entity' }));
  await harness.user.click(
    await screen.findByRole('button', { name: 'Cancel' }),
  );
};

/**
 * The open stage's draft as protocol-builder tells a host about it: the stage
 * a save would write, and whether leaving would lose any of it.
 */
describe('the stage draft a host follows', () => {
  it('is the stage the editor opened, with nothing to lose, once it may write', async () => {
    openQuickAddStage();

    await waitFor(() => expect(seen.draft?.editing).toBe(true));
    expect(seen.draft?.stage).toMatchObject({
      id: fixtureStageId('name-generator-quick-add-1'),
      type: 'NameGeneratorQuickAdd',
    });
    expect(seen.draft?.unsaved).toBe(false);
    expect(seen.draft?.codebook).toEqual({});
  });

  it('gives the same reading until the form changes', async () => {
    openQuickAddStage();
    await waitFor(() => expect(seen.draft?.editing).toBe(true));

    expect(seen.store?.getSnapshot()).toBe(seen.store?.getSnapshot());
  });

  /**
   * The rule behind "Finished Editing": a codebook change made in the stage
   * editor is saved only with the stage, so it is work leaving would lose,
   * even when the stage's own fields are untouched.
   */
  it('has something to lose when the only change is to the codebook', async () => {
    const harness = openQuickAddStage();
    await waitFor(() => expect(seen.draft?.editing).toBe(true));

    await inventPlace(harness);

    await waitFor(() => expect(seen.draft?.unsaved).toBe(true));
    expect(Object.keys(seen.draft?.codebook ?? {})).toHaveLength(1);
  });

  it('has nothing to lose again once the stage is saved', async () => {
    const harness = openQuickAddStage();
    await waitFor(() => expect(seen.draft?.editing).toBe(true));
    await inventPlace(harness);
    await waitFor(() => expect(seen.draft?.unsaved).toBe(true));

    expect(await harness.submit()).not.toBeNull();

    await waitFor(() => expect(seen.draft?.unsaved).toBe(false));
    expect(seen.draft?.codebook).toEqual({});
  });
});
