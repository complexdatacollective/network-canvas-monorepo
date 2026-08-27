import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';

// Bypasses the real NodePanel (which pulls in NetworkFilter's whole nested
// rule-builder tree): this test only exercises the array's own
// add/remove/toggle plumbing.
vi.mock('../NodePanel', () => ({
  default: () => <div data-testid="node-panel" />,
}));

// eslint-disable-next-line import/first -- must follow the vi.mock call above
import {
  asStage,
  renderStageForm,
} from '~/components/StageEditor/__tests__/stageFormTestHarness';

import { handlePanelToggleChange, NodePanels } from '../NodePanels';

describe('NodePanels', () => {
  it('keeps fields unset until add and creates at most two UUID-backed panels', async () => {
    const { getFieldState } = renderStageForm({
      committedStage: asStage({ subject: { entity: 'node', type: 'person' } }),
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

    // Panels are stage-registered leaves (`panels[N].*`), not one opaque
    // `panels` field (see NodePanels.tsx's file-top note) — read the id leaf
    // directly, since `getFieldState` resolves a dormant write the same way
    // a registered field resolves (stageFormHooks.ts's documented fallback).
    expect(getFieldState('panels[0].id')).toBeUndefined();

    // The section starts collapsed (no committed panels) — the real Section
    // toggle switch (unmocked here) must be opened before its children —
    // including the "Add new panel" button —
    // exist in the tree. The open-state guard is async, so the switch flips a
    // tick after the click.
    fireEvent.click(screen.getByRole('switch', { name: 'Side panels' }));
    await waitFor(() =>
      expect(
        screen.getByRole('switch', { name: 'Side panels' }),
      ).toHaveAttribute('aria-checked', 'true'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add new panel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add new panel' }));

    const panel0Id = getFieldState('panels[0].id')?.value;
    const panel1Id = getFieldState('panels[1].id')?.value;
    expect(typeof panel0Id).toBe('string');
    expect(typeof panel1Id).toBe('string');
    expect(panel0Id).not.toBe(panel1Id);
    expect(getFieldState('panels[0].title')?.value).toBeUndefined();
    expect(getFieldState('panels[0].dataSource')?.value).toBe('existing');
    expect(getFieldState('panels[0].filter')?.value).toBeUndefined();
    expect(getFieldState('panels[1].title')?.value).toBeUndefined();
    expect(getFieldState('panels[1].dataSource')?.value).toBe('existing');
    expect(getFieldState('panels[1].filter')?.value).toBeUndefined();

    expect(
      screen.queryByRole('button', { name: 'Add new panel' }),
    ).not.toBeInTheDocument();
  });

  it('blocks closing configured panels when removal is cancelled', async () => {
    const confirm = vi.fn(async () => false as const);

    await expect(
      handlePanelToggleChange(false, [{ id: 'panel-1' }], confirm),
    ).resolves.toBe(false);
    expect(confirm).toHaveBeenCalledOnce();
  });

  it('allows the Section to clear configured panels when removal is confirmed', async () => {
    const confirm = vi.fn(async () => true as const);

    await expect(
      handlePanelToggleChange(false, [{ id: 'panel-1' }], confirm),
    ).resolves.toBe(true);
    expect(confirm).toHaveBeenCalledOnce();
  });

  it('does not confirm when enabling panels or removing an empty list', async () => {
    const confirm = vi.fn(async () => true as const);

    await expect(
      handlePanelToggleChange(true, [{ id: 'panel-1' }], confirm),
    ).resolves.toBe(true);
    await expect(handlePanelToggleChange(false, [], confirm)).resolves.toBe(
      true,
    );
    expect(confirm).not.toHaveBeenCalled();
  });
});
