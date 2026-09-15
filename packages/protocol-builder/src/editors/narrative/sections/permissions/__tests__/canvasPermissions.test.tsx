import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderStageEditor } from '../../../../../testing/renderStageEditor.tsx';
import { canvasPermissions } from '../canvasPermissions.tsx';

const Permissions = canvasPermissions();

const openPermissions = () => ({
  stageId: 'narrative-1' as const,
  sections: <Permissions />,
});

describe('what the participant may do to a narrative canvas', () => {
  it('saves the permissions the stage opened with, unchanged', async () => {
    const harness = renderStageEditor(openPermissions());

    // Everything else about a narrative stage belongs to sections this mount
    // does not include.
    await harness.roundTrip({
      unowned: ['label', 'subject', 'presets', 'background'],
    });
  });

  it('withdraws permission to draw on the canvas', async () => {
    const harness = renderStageEditor(openPermissions());

    await harness.user.click(
      await screen.findByRole('switch', {
        name: 'Free-draw',
      }),
    );

    const saved = await harness.submit();
    // Each switch writes at its own path inside `behaviours`, so withdrawing
    // one leaves the other exactly as the stage held it.
    expect(saved?.stageDocument.behaviours).toEqual({
      freeDraw: false,
      allowRepositioning: true,
    });
  });

  it('stops the participant moving the nodes around', async () => {
    const harness = renderStageEditor(openPermissions());

    await harness.user.click(
      await screen.findByRole('switch', { name: 'Allow repositioning' }),
    );

    const saved = await harness.submit();
    expect(saved?.stageDocument.behaviours).toEqual({
      freeDraw: true,
      allowRepositioning: false,
    });
  });
});
