import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import { nodeLayout } from '../nodeLayout.tsx';

const NodeLayout = nodeLayout();

const openLayout = () => ({
  stageId: 'sociogram-1' as const,
  sections: <NodeLayout />,
});

describe('how a canvas arranges its nodes when the stage opens', () => {
  it('saves the layout the stage opened with, unchanged', async () => {
    const harness = renderStageEditor(openLayout());

    // Everything else about a sociogram belongs to sections this mount does
    // not include.
    await harness.roundTrip({
      unowned: ['subject', 'layout', 'prompts', 'background', 'tooltips'],
    });
  });

  it('hands the arranging back to the participant', async () => {
    const harness = renderStageEditor(openLayout());

    await harness.user.click(
      await screen.findByRole('option', { name: /Manual mode/ }),
    );

    const saved = await harness.submit();
    expect(saved?.stageDocument.behaviours).toEqual({
      automaticLayout: false,
    });
  });
});
