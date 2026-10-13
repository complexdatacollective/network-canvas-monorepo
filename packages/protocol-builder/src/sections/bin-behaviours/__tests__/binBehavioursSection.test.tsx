import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import { binBehaviours } from '../binBehaviours.tsx';

const CASES = [
  { stageId: 'ordinal-bin-1', BinBehaviours: binBehaviours('OrdinalBin') },
  {
    stageId: 'categorical-bin-1',
    BinBehaviours: binBehaviours('CategoricalBin'),
  },
] as const;

const gateSwitch = () =>
  screen.findByRole('switch', { name: 'Require every node to be placed' });
const noticeField = () =>
  screen.findByRole('textbox', { name: 'Nodes not yet placed' });

describe.each(CASES)(
  'how the participant places nodes on $stageId',
  ({ stageId, BinBehaviours }) => {
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

    it('does not require every node to be placed, and asks for no notice', async () => {
      renderStageEditor(open());

      expect(await gateSwitch()).not.toBeChecked();
      expect(
        screen.queryByRole('textbox', { name: 'Nodes not yet placed' }),
      ).not.toBeInTheDocument();
    });

    it('switched on, saves the gate with the words Network Canvas supplies', async () => {
      const harness = renderStageEditor(open());

      await harness.user.click(await gateSwitch());

      expect(await noticeField()).toHaveValue(
        'You must place every item before you can continue.',
      );
      const request = await harness.submit();
      expect(request?.stageDocument.behaviours).toEqual({
        requireCompletePlacement: true,
      });
      expect(request?.stageDocument.unplacedNodesNotice).toEqual({
        'en-US': 'You must place every item before you can continue.',
      });
    });

    it('switched back off, drops the notice it no longer shows', async () => {
      const harness = renderStageEditor(open());

      await harness.user.click(await gateSwitch());
      await noticeField();
      await harness.user.click(await gateSwitch());

      const request = await harness.submit();
      expect(request?.stageDocument).not.toHaveProperty('unplacedNodesNotice');
    });
  },
);
