import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import { binBehaviours } from '../binBehaviours.tsx';

const BinBehaviours = binBehaviours();

describe.each(['ordinal-bin-1', 'categorical-bin-1'] as const)(
  'how the participant places nodes on %s',
  (stageId) => {
    const open = () => ({ stageId, sections: <BinBehaviours /> });

    it('saves a stage that never chose, unchanged', async () => {
      const harness = renderStageEditor(open());

      await harness.roundTrip({ unowned: ['subject', 'prompts'] });
    });

    it('shows drag and drop as chosen when the stage says nothing', async () => {
      renderStageEditor(open());

      expect(
        await screen.findByRole('option', { name: /Drag and drop/ }),
      ).toHaveAttribute('aria-selected', 'true');
    });

    it('saves tap to place, and drag and drop again', async () => {
      const harness = renderStageEditor(open());

      await harness.user.click(
        await screen.findByRole('option', { name: /Tap to place/ }),
      );
      expect((await harness.submit())?.stageDocument.behaviours).toEqual({
        interactionMode: 'select',
      });

      await harness.user.click(
        await screen.findByRole('option', { name: /Drag and drop/ }),
      );
      expect((await harness.submit())?.stageDocument.behaviours).toEqual({
        interactionMode: 'drag',
      });
    });
  },
);
