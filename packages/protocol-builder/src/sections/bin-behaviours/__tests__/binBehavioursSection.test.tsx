import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import { binBehaviours, binWording } from '../binBehaviours.tsx';

const BinBehaviours = binBehaviours();
const CASES = [
  { stageId: 'ordinal-bin-1', BinWording: binWording('OrdinalBin') },
  {
    stageId: 'categorical-bin-1',
    BinWording: binWording('CategoricalBin'),
  },
] as const;

const gateSwitch = () =>
  screen.findByRole('switch', { name: 'Require every node to be placed' });
const noticeField = () =>
  screen.findByRole('textbox', { name: 'Nodes not yet placed' });
const wordingSwitch = () =>
  screen.findByRole('switch', { name: 'Customize built-in wording' });

/**
 * Switches the stage's built-in wording on and shows the stage's own words:
 * where the stage also shows words its kind shares, they are a part of their
 * own that starts closed.
 */
const showStageWording = async (
  user: ReturnType<typeof renderStageEditor>['user'],
) => {
  await user.click(await wordingSwitch());
  const specific = screen.queryByRole('button', {
    name: 'Specific to this stage',
  });
  if (specific) await user.click(specific);
};

describe.each(CASES)(
  'how the participant places nodes on $stageId',
  ({ stageId, BinWording }) => {
    // In a language Network Canvas has built-in wording in, so the notice
    // starts with its words.
    const open = () => ({
      stageId,
      fixtureLanguage: 'en',
      sections: (
        <>
          <BinBehaviours />
          <BinWording />
        </>
      ),
    });

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

    it('lets the notice name the node type', async () => {
      const harness = renderStageEditor(open());

      await harness.user.click(await gateSwitch());
      await showStageWording(harness.user);
      await noticeField();

      expect(
        screen.getByRole('button', {
          name: 'Inject piped text from this stage',
        }),
      ).toBeInTheDocument();
    });

    it('switched on, saves the gate with the words Network Canvas supplies', async () => {
      const harness = renderStageEditor(open());

      await harness.user.click(await gateSwitch());
      await showStageWording(harness.user);

      expect(await noticeField()).toHaveTextContent(
        'You must place every item before you can continue.',
      );
      const request = await harness.submit();
      expect(request?.stageDocument.behaviours).toEqual({
        requireCompletePlacement: true,
      });
      expect(request?.stageDocument.unplacedNodesNotice).toEqual({
        en: 'You must place every item before you can continue.',
      });
    });

    it('switched back off, drops the notice it no longer shows', async () => {
      const harness = renderStageEditor(open());

      await harness.user.click(await gateSwitch());
      await showStageWording(harness.user);
      await noticeField();
      await harness.user.click(await gateSwitch());

      const request = await harness.submit();
      expect(request?.stageDocument).not.toHaveProperty('unplacedNodesNotice');
    });
  },
);
