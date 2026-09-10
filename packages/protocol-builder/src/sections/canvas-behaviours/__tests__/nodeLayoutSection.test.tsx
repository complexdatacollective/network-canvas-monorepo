import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { fixtureMessage } from '../../../testing/i18n.ts';
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
   * An interface whose manual mode looks nothing like the shared one says so
   * in its own words, and says nothing else differently.
   *
   * The sentence travels as a `MessageDescriptor` rather than a string, so it
   * is extracted, translated and guarded like every other; what proves it
   * reached the card is that the shared sentence is not there instead.
   */
  it('says what manual mode looks like on the interface that supplied a sentence', async () => {
    const OwnWording = nodeLayout({
      manualDescription: fixtureMessage(
        'Every node is already where the stage put it.',
      ),
    });
    renderStageEditor({
      stageId: 'sociogram-1',
      sections: <OwnWording />,
    });

    expect(
      await screen.findByText('Every node is already where the stage put it.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        'Places all nodes in a "bucket" at the bottom of the screen, from which the participant drags each one to where they want it.',
      ),
    ).not.toBeInTheDocument();
  });
});
