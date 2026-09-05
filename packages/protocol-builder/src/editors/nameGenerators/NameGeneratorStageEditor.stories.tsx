import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import FixtureStageEditorHost from './FixtureStageEditorHost.tsx';
import { NameGeneratorStageEditor } from './NameGeneratorStageEditor.tsx';

function NameGeneratorEditorStory({ readOnly = false }: EditorStoryArgs) {
  return (
    <FixtureStageEditorHost stageId="name-generator-1" readOnly={readOnly}>
      {(controller) => (
        <NameGeneratorStageEditor
          controller={controller}
          stageType="NameGenerator"
        />
      )}
    </FixtureStageEditorHost>
  );
}

type EditorStoryArgs = Readonly<{ readOnly?: boolean }>;

const meta = {
  title: 'Protocol Builder/Stage editors/Name Generator',
  component: NameGeneratorEditorStory,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The name generator a participant names people with, one form at a time. Opened on the shared all-interfaces protocol, over a real editing session: the node type comes from that protocol’s codebook, the form’s attributes from the type, and saving hands the whole stage to the host.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof NameGeneratorEditorStory>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Renaming a stage and saving it: the whole editor, end to end. */
export const Editing: Story = {
  args: {},
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await userEvent.type(
      canvas.getByRole('textbox', { name: 'Stage name' }),
      ' (revised)',
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
