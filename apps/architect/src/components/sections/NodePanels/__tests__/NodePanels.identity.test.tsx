import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';

// A stand-in for `NodePanel` that registers the same stage-form leaves the
// real one does — see `nodePanelStub` for why that matters here.
vi.mock('../NodePanel', async () => ({
  default: (await import('./nodePanelStub')).default,
}));

// eslint-disable-next-line import/first -- must follow the vi.mock call above
import {
  asStage,
  renderStageForm,
} from '~/components/StageEditor/__tests__/stageFormTestHarness';

// eslint-disable-next-line import/first -- must follow the vi.mock call above
import { NodePanels } from '../NodePanels';

const toggle = () =>
  screen.getByRole('switch', { name: 'Turn this feature on or off' });

const ONE_PANEL = [
  { id: 'panel-1', title: 'A', dataSource: 'existing', filter: null },
];

const TWO_PANELS = [
  ...ONE_PANEL,
  { id: 'panel-2', title: 'B', dataSource: 'existing', filter: null },
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
