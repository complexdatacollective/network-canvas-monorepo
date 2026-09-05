import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import FixtureStageEditorHost from './FixtureStageEditorHost.tsx';
import { NameGeneratorQuickAddStageEditor } from './NameGeneratorQuickAddStageEditor.tsx';

function NameGeneratorQuickAddEditorStory({
  readOnly = false,
}: EditorStoryArgs) {
  return (
    <FixtureStageEditorHost
      stageId="name-generator-quick-add-1"
      readOnly={readOnly}
    >
      {(controller) => (
        <NameGeneratorQuickAddStageEditor
          controller={controller}
          stageType="NameGeneratorQuickAdd"
        />
      )}
    </FixtureStageEditorHost>
  );
}

type EditorStoryArgs = Readonly<{ readOnly?: boolean }>;

const meta = {
  title: 'Protocol Builder/Stage editors/Name Generator (quick add)',
  component: NameGeneratorQuickAddEditorStory,
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
} satisfies Meta<typeof NameGeneratorQuickAddEditorStory>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Choosing what the single box fills in, and saving the stage. */
export const Editing: Story = {
  args: {},
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await userEvent.selectOptions(
      await canvas.findByRole('combobox', { name: /Attribute filled in/ }),
      'relationship_to_ego',
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Save stage' }));

    await waitFor(async () => {
      await expect(canvas.getByText('Stage saved')).toBeVisible();
    });
  },
};

/** Someone else holds the stage: every control is inert. */
export const Spectating: Story = {
  args: { readOnly: true },
};
