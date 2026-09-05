import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import FixtureStageEditorHost from './FixtureStageEditorHost.tsx';
import { NameGeneratorRosterStageEditor } from './NameGeneratorRosterStageEditor.tsx';

function NameGeneratorRosterEditorStory({ readOnly = false }: EditorStoryArgs) {
  return (
    <FixtureStageEditorHost
      stageId="name-generator-roster-1"
      readOnly={readOnly}
    >
      {(controller) => (
        <NameGeneratorRosterStageEditor
          controller={controller}
          stageType="NameGeneratorRoster"
        />
      )}
    </FixtureStageEditorHost>
  );
}

type EditorStoryArgs = Readonly<{ readOnly?: boolean }>;

const meta = {
  title: 'Protocol Builder/Stage editors/Name Generator for Roster Data',
  component: NameGeneratorRosterEditorStory,
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
} satisfies Meta<typeof NameGeneratorRosterEditorStory>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Every section below the data file waits on it, so the play waits for the
 * file to be read before editing the stage and saving it.
 */
export const Editing: Story = {
  args: {},
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await canvas.findByText(
      'The people in it carry these attributes: age, name.',
    );
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
