import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import StageEditor from '../../StageEditor.tsx';
import { dispatchThroughPart } from '../../testing/incompleteRegistry.ts';
import { StageEditorStoryHost } from '../../testing/StageEditorStoryHost.tsx';
import { nameGeneratorStageEditors } from '../nameGeneratorStageEditors.ts';

const meta = {
  title: 'Protocol Builder/Stage editors/Name Generator (quick add)',
  component: StageEditorStoryHost,
  args: {
    stageId: 'name-generator-quick-add-1',
    renderEditor: ({ controller, actions }) => (
      <StageEditor
        controller={controller}
        registry={dispatchThroughPart(nameGeneratorStageEditors)}
        actions={actions}
      />
    ),
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The name generator a participant names people with in a single box. Opened on the shared all-interfaces protocol, over a real editing session: the attribute the box fills in is chosen from the node type’s own codebook, and saving hands the whole stage to the host.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof StageEditorStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Choosing what the single box fills in, and saving the stage. */
export const Editing: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await userEvent.selectOptions(
      await canvas.findByRole('combobox', { name: /Attribute filled in/ }),
      'relationship_to_ego',
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Save stage' }));

    await waitFor(async () => {
      await expect(
        canvas.getByRole('status', { name: 'Save status' }),
      ).toHaveTextContent('Saved “Name Generator Quick Add”.');
    });
    // The choice itself, in the document the host was handed: a save that
    // reported success while committing the attribute it opened on would look
    // identical above.
    await expect(
      canvas.getByRole('region', { name: 'What the host was asked to commit' }),
    ).toHaveTextContent('"quickAdd": "relationship_to_ego"');
  },
};

/** Someone else holds the stage: every control is inert. */
export const Spectating: Story = {
  args: { readOnly: true },
};
