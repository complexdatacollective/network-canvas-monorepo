import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import StageEditor from '../../StageEditor.tsx';
import { StageEditorStoryHost } from '../../testing/StageEditorStoryHost.tsx';
import { nameGeneratorStageEditors } from '../nameGeneratorStageEditors.ts';

const meta = {
  title: 'Protocol Builder/Stage editors/Name Generator for Roster Data',
  component: StageEditorStoryHost,
  args: {
    stageId: 'name-generator-roster-1',
    renderEditor: ({ controller, actions }) => (
      <StageEditor
        controller={controller}
        registry={nameGeneratorStageEditors}
        actions={actions}
      />
    ),
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The name generator a participant chooses people from a list with. Opened on the shared all-interfaces protocol, over a real editing session with that protocol’s own roster file in the resource gateway: what the cards show, how the list is ordered and what a search matches are all chosen from the columns read out of that file.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof StageEditorStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Every section below the data file waits on it, so the play waits for the
 * file to be read before editing the stage and saving it.
 */
export const Editing: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await canvas.findByText(
      'The people in it carry these attributes: age and name.',
    );
    await userEvent.type(
      canvas.getByRole('textbox', { name: 'Stage name' }),
      ' (revised)',
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Save stage' }));

    await waitFor(async () => {
      await expect(
        canvas.getByRole('status', { name: 'Save status' }),
      ).toHaveTextContent('Saved “Name Generator Roster (revised)”.');
    });
    await expect(
      canvas.getByRole('region', { name: 'What the host was asked to commit' }),
    ).toHaveTextContent('"label": "Name Generator Roster (revised)"');
  },
};

/** Someone else holds the stage: every control is inert. */
export const Spectating: Story = {
  args: { readOnly: true },
};
