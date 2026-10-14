import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import StageEditor from '../../StageEditor.tsx';
import { StageEditorStoryHost } from '../../testing/StageEditorStoryHost.tsx';
import { finishSessionStageEditor } from './FinishSessionStageEditor.ts';

const meta = {
  title: 'Protocol Builder/Stage editors/Finish Screen',
  component: StageEditorStoryHost,
  args: {
    stageId: 'finish',
    // Through the dispatcher rather than by naming the component, so the story
    // also shows that this editor claims the interface its stage is of.
    renderEditor: ({ actions, ...editor }) => (
      <StageEditor
        {...editor}
        registry={finishSessionStageEditor}
        actions={actions}
      />
    ),
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The editor for the screen that ends the interview: whether participants confirm or the interview finishes on arrival, the closing text read before finishing, the finished text read afterwards, and the outcome an interview that ends there is recorded with. There is no skip logic, because every route through the interview ends at a finish screen. It is opened here over a real editing session holding the shared all-interfaces protocol, on its finish stage.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof StageEditorStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The protocol's finish stage, as the researcher meets it. */
export const Editing: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    const outcomes = await canvas.findByRole('listbox', {
      name: /How the interview ended/,
    });
    await userEvent.click(
      within(outcomes).getByRole('option', { name: /Ended early/ }),
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Save stage' }));

    await waitFor(async () => {
      await expect(
        canvas.getByRole('region', {
          name: 'What the host was asked to commit',
        }),
      ).toHaveTextContent('"outcome": "terminated"');
    });
  },
};

/**
 * Finishing automatically: the closing screen and the confirmation question
 * leave the editor, because a participant never sees them.
 */
export const FinishingAutomatically: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await canvas.findByRole('heading', { name: 'Closing screen' });
    await userEvent.click(
      within(canvas.getByRole('listbox', { name: /Finishing/ })).getByRole(
        'option',
        { name: /Finish automatically/ },
      ),
    );

    await waitFor(async () => {
      await expect(
        canvas.queryByRole('heading', { name: 'Closing screen' }),
      ).not.toBeInTheDocument();
    });
    await expect(
      canvas.queryByRole('textbox', { name: /Confirmation question/ }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.getByRole('heading', { name: 'Finished screen' }),
    ).toBeInTheDocument();
  },
};
