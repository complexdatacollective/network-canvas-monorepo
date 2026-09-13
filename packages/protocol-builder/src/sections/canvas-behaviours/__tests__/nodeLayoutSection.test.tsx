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
      unowned: ['label', 'subject', 'prompts', 'background'],
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

  /**
   * The other two canvas behaviours are expressible on a sociogram — the
   * schema shares one object with the narrative interface — and no interface
   * offers them, because the interview honours neither there. A stage
   * somebody authored by hand carrying one has to keep it: this section
   * writes the arrangement, not the whole object.
   */
  it('keeps a behaviour it does not offer', async () => {
    const harness = renderStageEditor({
      stage: {
        type: 'Sociogram' as const,
        fields: {
          label: 'Sociogram',
          subject: { entity: 'node', type: 'person' },
          background: { concentricCircles: 4 },
          behaviours: { automaticLayout: true, freeDraw: true },
          prompts: [
            {
              id: 'sociogram-prompt-1',
              text: 'Place the people you know',
              layout: { layoutVariable: 'layout' },
            },
          ],
        },
      },
      sections: <NodeLayout />,
    });

    await harness.user.click(
      await screen.findByRole('option', { name: /Manual mode/ }),
    );

    const saved = await harness.submit();
    expect(saved?.stageDocument.behaviours).toEqual({
      automaticLayout: false,
      freeDraw: true,
    });
  });
});
