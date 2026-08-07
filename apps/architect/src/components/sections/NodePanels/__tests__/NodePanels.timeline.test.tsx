import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';

// A stand-in for `NodePanel` that registers the same stage-form leaves the
// real one does — see `nodePanelStub`. Registration is what these tests turn
// on: the timeline is built from `getFormValues()`, which reports REGISTERED
// fields only.
vi.mock('../NodePanel', async () => ({
  default: (await import('./nodePanelStub')).default,
}));

// eslint-disable-next-line import/first -- must follow the vi.mock call above
import { HiddenFieldValue } from '~/components/sections/Form/withFieldsHandlers';
// eslint-disable-next-line import/first -- must follow the vi.mock call above
import {
  asStage,
  renderStageForm,
} from '~/components/StageEditor/__tests__/stageFormTestHarness';

// eslint-disable-next-line import/first -- must follow the vi.mock call above
import { NodePanels } from '../NodePanels';

type StageWithPanels = { panels?: { id?: unknown; dataSource?: unknown }[] };

const toggle = () =>
  screen.getByRole('switch', { name: 'Turn this feature on or off' });

const renderPanels = (committedPanels?: unknown[]) =>
  renderStageForm({
    committedStage: asStage({
      subject: { entity: 'node', type: 'person' },
      ...(committedPanels ? { panels: committedPanels } : {}),
    }),
    children: (
      <DialogProvider>
        {/*
          The stage's subject is a real registered field in the editor, and it
          has to be one here too: an unregistered name is absent from every
          snapshot, so the first undo would park it in dormant storage and the
          redo would then clear it — disabling the section under test for
          reasons that have nothing to do with panels.
        */}
        <HiddenFieldValue name="subject.entity" initialValue="node" />
        <HiddenFieldValue name="subject.type" initialValue="person" />
        <NodePanels
          stagePath="stages[0]"
          stagePosition={0}
          interfaceType="NameGeneratorQuickAdd"
        />
      </DialogProvider>
    ),
  });

/** The section starts collapsed with no committed panels. */
const openSection = async () => {
  fireEvent.click(toggle());
  await waitFor(() => expect(toggle()).toHaveAttribute('aria-checked', 'true'));
};

const addPanel = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Add new panel' }));
  await waitFor(() =>
    expect(screen.getAllByTestId('node-panel')).toHaveLength(1),
  );
};

/** The removed row animates out, so its fields unregister a frame later. */
const waitForNoPanels = async () =>
  waitFor(() => expect(screen.queryAllByTestId('node-panel')).toHaveLength(0));

describe('NodePanels undo timeline', () => {
  it('records an added panel as its own timeline entry', async () => {
    const { getHistory, getPresent } = renderPanels();

    await openSection();
    await addPanel();

    // Regression: the add writes leaves that are not registered yet, so it
    // lands in dormant storage without touching the store's `fields` map and
    // the bridge never sees a change. Undo was left disabled, and the panel
    // only reached the timeline attached to the NEXT edit — so undoing that
    // edit deleted the whole panel instead.
    expect(getHistory().canUndo).toBe(true);

    const present = getPresent() as StageWithPanels;
    expect(present.panels).toHaveLength(1);
    expect(typeof present.panels?.[0]?.id).toBe('string');
    // The whole row, not just the id: the effect that snapshots runs after its
    // children's register effects, so every leaf is in the form's output.
    expect(present.panels?.[0]?.dataSource).toBe('existing');
  });

  it('undoes an added panel and redoes it without branching the timeline', async () => {
    const { getHistory, getPresent, getFormValues, snapshots, store } =
      renderPanels();

    await openSection();
    await addPanel();
    expect(snapshots).toHaveLength(1);

    act(() => {
      getHistory().undo();
    });
    await waitForNoPanels();

    expect(getFormValues()).not.toHaveProperty('panels');
    expect(getHistory().canRedo).toBe(true);

    act(() => {
      getHistory().redo();
    });
    await waitFor(() =>
      expect(screen.getAllByTestId('node-panel')).toHaveLength(1),
    );

    expect((getPresent() as StageWithPanels).panels).toHaveLength(1);
    // A restore re-adds the panel by writing the same leaves, so it reaches
    // the snapshot effect looking exactly like the gesture. Snapshotting there
    // would branch `future` and throw away everything ahead of the step.
    expect(snapshots).toHaveLength(1);
    expect(store.getState().stageEditorDraft.history.future).toHaveLength(0);
    expect(getHistory().canUndo).toBe(true);
  });

  it('does not record an entry for a stage that opens with panels already configured', async () => {
    const { getHistory, snapshots } = renderPanels([
      { id: 'panel-1', title: 'A', dataSource: 'existing', filter: null },
    ]);

    await waitFor(() =>
      expect(screen.getAllByTestId('node-panel')).toHaveLength(1),
    );

    // The ids the section renders from appear during mount, which must not
    // read as an add: the timeline would start one step in, with Undo enabled
    // before the researcher had done anything.
    expect(snapshots).toHaveLength(0);
    expect(getHistory().canUndo).toBe(false);
  });
});
