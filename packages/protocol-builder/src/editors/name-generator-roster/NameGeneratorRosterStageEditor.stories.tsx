import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import StageEditor from '../../StageEditor.tsx';
import { StageEditorStoryHost } from '../../testing/StageEditorStoryHost.tsx';
import { nameGeneratorRosterStageEditor } from './NameGeneratorRosterStageEditor.ts';
import { withRosterColumns } from './rosterInspection.ts';

const meta = {
  title: 'Protocol Builder/Stage editors/Name Generator (roster)',
  component: StageEditorStoryHost,
  args: {
    stageId: 'name-generator-roster-1',
    // Everything below the data file is chosen from that file's columns, and
    // reading a file is the host's job — so the story says what this one holds,
    // exactly as a host that had read it would.
    client: withRosterColumns,
    // Through the dispatcher rather than by naming the component, so the story
    // also shows that this editor claims the interface its stage is of.
    renderEditor: ({ actions, ...editor }) => (
      <StageEditor
        {...editor}
        registry={nameGeneratorRosterStageEditor}
        actions={actions}
      />
    ),
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The name generator a participant chooses people from an imported list with. The data file comes first, because what a card shows, what the list is ordered by and what a search matches are all chosen from its columns.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof StageEditorStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Offering the participant one more attribute to reorder the roster by. */
export const OrderingTheRoster: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    // The columns arrive from the gateway, so nothing on this stage can be
    // configured until they have.
    await canvas.findByText(
      'The people in it carry these attributes: age and name.',
    );

    const sortable = await canvas.findByRole('list', {
      name: /Attributes the participant may sort by/,
    });
    await userEvent.selectOptions(
      within(sortable).getByRole('combobox', { name: /Attribute/ }),
      'name',
    );
    await userEvent.type(
      within(sortable).getByRole('textbox', { name: /Label/ }),
      'Name',
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Save stage' }));

    await waitFor(async () => {
      await expect(
        canvas.getByRole('status', { name: 'Save status' }),
      ).toHaveTextContent('Saved “Name Generator Roster”.');
    });
    // The choice itself, in the document the host was handed: a save that
    // reported success while committing the stage it opened on would look
    // identical above.
    await expect(
      canvas.getByRole('region', { name: 'What the host was asked to commit' }),
    ).toHaveTextContent('"variable": "name"');
  },
};

/** Someone else holds the stage: every control is inert. */
export const Spectating: Story = {
  args: { readOnly: true },
};
