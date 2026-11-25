import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, screen, userEvent, waitFor, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import StageEditor from '../../StageEditor.tsx';
import { fixtureStageId } from '../../testing/protocolFixture.ts';
import { StageEditorStoryHost } from '../../testing/StageEditorStoryHost.tsx';
import { tieStrengthCensusStageEditor } from './TieStrengthCensusStageEditor.ts';

const meta = {
  title: 'Protocol Builder/Stage editors/Tie-Strength Census',
  component: StageEditorStoryHost,
  args: {
    stageId: fixtureStageId('tie-strength-census-1'),
    // Through the dispatcher rather than by naming the component, so the story
    // also shows that this editor claims the interface its stage is of.
    renderEditor: ({ actions, ...editor }) => (
      <StageEditor
        {...editor}
        registry={tieStrengthCensusStageEditor}
        actions={actions}
      />
    ),
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The stage a participant rates every pair of people in. The same composition as the Dyad Census, and a prompt that records one more thing: the attribute of the connection whose ordered values are the scale the answer is given on.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof StageEditorStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Opening a prompt: the question, the connection it rates, and the scale. */
export const EditingAPrompt: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await userEvent.click(canvas.getByRole('button', { name: 'Edit prompt' }));

    // The row dialog is portalled out of the canvas, so it is found on the
    // document rather than inside the editor that opened it.
    const panel = await screen.findByRole('dialog');
    const dialog = within(panel);
    await waitFor(async () => {
      await expect(dialog.getByRole('radio', { name: 'knows' })).toBeChecked();
    });
    // The scale is the CONNECTION's attribute, not the person's.
    await expect(
      panel.querySelector('[data-attribute-type]'),
    ).toHaveTextContent('closeness');

    // Choosing a different attribute happens in a popup anchored to the
    // field, opened from inside this dialog. It is not a second modal, so the
    // dialog keeps its one dimmed layer, and the popup paints above the dialog
    // rather than behind it.
    await userEvent.click(dialog.getByRole('combobox', { name: /closeness/u }));

    const popup = await waitFor(() => {
      const opened = document.body.querySelector<HTMLElement>(
        '[data-attribute-picker-popup][data-open]',
      );
      if (opened === null) throw new Error('The attribute popup is closed.');
      return opened;
    });
    await expect(
      document.querySelectorAll('[data-modal-backdrop]'),
    ).toHaveLength(1);
    await waitFor(async () => {
      const { left, top, width, height } = popup.getBoundingClientRect();
      const front = document.elementFromPoint(
        left + width / 2,
        top + height / 2,
      );
      await expect(popup.contains(front)).toBe(true);
    });
  },
};

/** Someone else holds the stage: every control is inert. */
export const Spectating: Story = {
  args: { readOnly: true },
};
