import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';

// A stand-in for `NodePanel` that registers the same stage-form leaves the
// real one does — see `nodePanelStub` for why that matters here.
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

const toggle = () => screen.getByRole('switch', { name: 'Side Panels' });

const ONE_PANEL = [
  { id: 'panel-1', title: 'A', dataSource: 'existing', filter: undefined },
];

const TWO_PANELS = [
  ...ONE_PANEL,
  { id: 'panel-2', title: 'B', dataSource: 'existing', filter: undefined },
];

const renderPanels = (panels: Record<string, unknown>[] = ONE_PANEL) =>
  renderStageForm({
    committedStage: asStage({
      subject: { entity: 'node', type: 'person' },
      panels,
    }),
    children: (
      <DialogProvider>
        <NodePanels
          stagePath="stages[0]"
          stagePosition={0}
          interfaceType="NameGeneratorQuickAdd"
        />
      </DialogProvider>
    ),
  });

/** The removed row animates out, so its fields unregister a frame later. */
const waitForNoPanels = async () =>
  waitFor(() => expect(screen.queryAllByTestId('node-panel')).toHaveLength(0));

describe('NodePanels panel identity', () => {
  it('gives a panel added after a toggle-off/on cycle an id', async () => {
    const { getFormValues } = renderPanels();

    await waitFor(() =>
      expect(toggle()).toHaveAttribute('aria-checked', 'true'),
    );

    fireEvent.click(toggle());
    await waitFor(() =>
      expect(toggle()).toHaveAttribute('aria-checked', 'false'),
    );
    expect(getFormValues()).not.toHaveProperty('panels');

    fireEvent.click(toggle());
    await waitFor(() =>
      expect(toggle()).toHaveAttribute('aria-checked', 'true'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add new panel' }));
    await waitFor(() =>
      expect(screen.getAllByTestId('node-panel')).toHaveLength(1),
    );

    // Regression: the section used to read its list off the `panels` CONTAINER
    // path, which the toggle-off's dormant "cleared" sentinel shadows for the
    // rest of the session. The id registrations are rendered from that list,
    // so the new panel was saved with no `id` at all — a panel the protocol
    // schema rejects (`panelSchema.id`).
    const panels = (getFormValues() as { panels?: { id?: unknown }[] }).panels;
    expect(panels).toHaveLength(1);
    expect(typeof panels?.[0]?.id).toBe('string');
  });

  it('drops the panels key entirely when the last panel is deleted', async () => {
    const { getFormValues } = renderPanels();

    await waitFor(() =>
      expect(screen.getAllByTestId('node-panel')).toHaveLength(1),
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Remove side panel 1' }),
    );
    await waitForNoPanels();

    // Regression: the container read fell back to the COMMITTED stage once the
    // row's leaves were gone, which re-rendered the id registration and left
    // `panels: [{}]` — an empty panel object — in the saved stage.
    expect(getFormValues()).not.toHaveProperty('panels');
  });

  it('keeps the surviving panel whole when the first of two is deleted', async () => {
    const { getFormValues } = renderPanels(TWO_PANELS);

    await waitFor(() =>
      expect(screen.getAllByTestId('node-panel')).toHaveLength(2),
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Remove side panel 1' }),
    );

    await waitFor(() =>
      expect(screen.getAllByTestId('node-panel')).toHaveLength(1),
    );

    // Regression: deleting a panel re-indexes the list while the deleted row is
    // still mounted for its exit animation, so for a moment two live rows were
    // bound to `panels[0]` — the store keys `fields` by name alone, with no
    // notion of which component owns an entry. The survivor registered over the
    // exiting row's fields, and the exit then unregistered the names it no
    // longer owned, taking the survivor's live fields with them. The panel
    // saved as `{id: 'panel-2'}` alone, with `title`/`dataSource` stranded in
    // dormant storage still holding the DELETED panel's values — a stage
    // `panelSchema` rejects for the missing keys, and wrong data if they
    // returned.
    await waitFor(() =>
      expect(getFormValues()).toMatchObject({
        panels: [
          {
            id: 'panel-2',
            title: 'B',
            dataSource: 'existing',
          },
        ],
      }),
    );
  });

  it('keeps the section open after the last panel is deleted', async () => {
    renderPanels();

    await waitFor(() =>
      expect(toggle()).toHaveAttribute('aria-checked', 'true'),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove side panel 1' }),
    );
    await waitForNoPanels();

    // The list going empty is not the researcher turning the feature off, so
    // the section must not collapse out from under them (useLatchedExpansion).
    expect(toggle()).toHaveAttribute('aria-checked', 'true');
    expect(
      screen.getByRole('button', { name: 'Add new panel' }),
    ).toBeInTheDocument();
  });
});

/**
 * A panel's `synthetic` block — its generation parameters — has no control in
 * this editor, so it survives only because `usePanelAt` reads it and
 * `writePanelAt` writes it back. They are a closed pair: `handlePanelsChange`
 * is `ArrayField`'s `onChange`, and it rewrites the whole bounded slot set
 * from the list `usePanelAt` assembled. A key missing from either side is lost
 * on the next add, reorder or toggle-off — long before any save.
 */
describe('NodePanels authored synthetic parameters', () => {
  const FIRST_SYNTHETIC = { nominationProbability: 0.6 };
  const SECOND_SYNTHETIC = { nominationProbability: 0.15 };

  const panelWithSynthetic = (
    id: string,
    title: string,
    synthetic: Record<string, unknown>,
  ) => ({ id, title, dataSource: 'existing', filter: undefined, synthetic });

  // The subject is a real registered field in the editor, and has to be one
  // here too: an unregistered name is absent from every snapshot, so an undo
  // would park it in dormant storage and disable the section under test for
  // reasons that have nothing to do with panels.
  const renderWithSubject = (panels: Record<string, unknown>[]) =>
    renderStageForm({
      committedStage: asStage({
        subject: { entity: 'node', type: 'person' },
        panels,
      }),
      children: (
        <DialogProvider>
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

  const panelsIn = (values: unknown) =>
    (values as { panels?: { id?: string; synthetic?: unknown }[] }).panels;

  it('keeps an existing panel’s block when another panel is added', async () => {
    const { getFormValues } = renderPanels([
      panelWithSynthetic('panel-1', 'A', FIRST_SYNTHETIC),
    ]);

    await waitFor(() =>
      expect(screen.getAllByTestId('node-panel')).toHaveLength(1),
    );
    expect(panelsIn(getFormValues())?.[0]?.synthetic).toEqual(FIRST_SYNTHETIC);

    fireEvent.click(screen.getByRole('button', { name: 'Add new panel' }));
    await waitFor(() =>
      expect(screen.getAllByTestId('node-panel')).toHaveLength(2),
    );

    // The add rewrites BOTH slots from the assembled list, so an unread key is
    // erased from the untouched panel by the act of adding a different one.
    await waitFor(() => {
      const panels = panelsIn(getFormValues());
      expect(panels).toHaveLength(2);
      expect(panels?.[0]?.synthetic).toEqual(FIRST_SYNTHETIC);
    });
    // The new panel is authored by nobody, so it must not acquire a block.
    expect(panelsIn(getFormValues())?.[1]?.synthetic).toBeUndefined();
  });

  it('moves each panel’s own block with it through a reorder', async () => {
    const { getFormValues } = renderPanels([
      panelWithSynthetic('panel-1', 'A', FIRST_SYNTHETIC),
      panelWithSynthetic('panel-2', 'B', SECOND_SYNTHETIC),
    ]);

    await waitFor(() =>
      expect(screen.getAllByTestId('node-panel')).toHaveLength(2),
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Move side panel 2 up' }),
    );

    // Distinct values on the two panels, because equal ones would pass even if
    // the reorder wrote every slot from the same source panel.
    await waitFor(() => {
      const panels = panelsIn(getFormValues());
      expect(panels?.[0]?.id).toBe('panel-2');
      expect(panels?.[0]?.synthetic).toEqual(SECOND_SYNTHETIC);
      expect(panels?.[1]?.id).toBe('panel-1');
      expect(panels?.[1]?.synthetic).toEqual(FIRST_SYNTHETIC);
    });
  });

  it('restores the block when a toggle-off is undone', async () => {
    const { getFormValues, getHistory } = renderWithSubject([
      panelWithSynthetic('panel-1', 'A', FIRST_SYNTHETIC),
    ]);

    await waitFor(() =>
      expect(toggle()).toHaveAttribute('aria-checked', 'true'),
    );

    fireEvent.click(toggle());
    await waitFor(() =>
      expect(toggle()).toHaveAttribute('aria-checked', 'false'),
    );
    expect(getFormValues()).not.toHaveProperty('panels');

    act(() => {
      getHistory().undo();
    });

    // The toggle-off parks every leaf in dormant storage, where a remount
    // prefers it over `initialValue` — so a block that was never a registered
    // leaf could not come back at all.
    await waitFor(() => {
      expect(panelsIn(getFormValues())?.[0]?.synthetic).toEqual(
        FIRST_SYNTHETIC,
      );
    });
  });
});
