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

const renderPanels = () =>
  renderStageForm({
    committedStage: asStage({
      subject: { entity: 'node', type: 'person' },
      panels: [
        { id: 'panel-1', title: 'A', dataSource: 'existing', filter: null },
      ],
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
