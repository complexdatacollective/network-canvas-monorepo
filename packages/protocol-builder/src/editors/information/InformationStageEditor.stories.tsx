import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import StageEditor from '../../StageEditor.tsx';
import { StageEditorStoryHost } from '../../testing/StageEditorStoryHost.tsx';
import { informationStageEditor } from './InformationStageEditor.ts';

const meta = {
  title: 'Protocol Builder/Stage editors/Information',
  component: StageEditorStoryHost,
  args: {
    stageId: 'information-1',
    // Through the dispatcher rather than by naming the component, so the story
    // also shows that this editor claims the interface its stage is of.
    renderEditor: ({ actions, ...editor }) => (
      <StageEditor
        {...editor}
        registry={informationStageEditor}
        actions={actions}
      />
    ),
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The editor for a page the participant reads rather than a task they do: a heading and an ordered list of blocks of text and media, plus the skip logic and interviewer guidance every stage carries. It is opened here over a real editing session holding the shared all-interfaces protocol.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof StageEditorStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The editor as the researcher meets it, on a page that already has content. */
export const Editing: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    const name = canvas.getByRole('textbox', { name: 'Stage name' });
    await userEvent.clear(name);
    await userEvent.type(name, 'Welcome screen');
    await userEvent.click(canvas.getByRole('button', { name: 'Save stage' }));

    await waitFor(async () => {
      await expect(
        canvas.getByRole('status', { name: 'Save status' }),
      ).toHaveTextContent('Saved “Welcome screen”.');
    });
    await expect(
      canvas.getByRole('region', { name: 'What the host was asked to commit' }),
    ).toHaveTextContent('"label": { "en-US": "Welcome screen" }');
  },
};

/** Someone else holds the lease: every control is inert and saving is refused. */
export const Spectating: Story = {
  args: { readOnly: true },
};

/**
 * A value the interview fills in, inserted into the heading: typing `{`
 * offers what the heading can show, and choosing the participant's name
 * binds it to the stage, inside versions for when it is known and when it is
 * not.
 */
export const ShowingAValue: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await awaitPassiveEffects();

    const heading = await canvas.findByRole('textbox', {
      name: 'Page heading',
    });
    await userEvent.click(heading);
    await userEvent.keyboard(' {{');
    await body.findByRole('combobox', { name: 'Search' });
    await userEvent.keyboard('ego_name{Enter}');
    // The name can be missing, so it arrives in versions for when it is
    // known and when it is not.
    await expect(
      await canvas.findByRole('group', { name: /ego_name/ }),
    ).toBeInTheDocument();

    await userEvent.click(canvas.getByRole('button', { name: 'Save stage' }));
    await waitFor(async () => {
      await expect(
        canvas.getByRole('region', {
          name: 'What the host was asked to commit',
        }),
      ).toHaveTextContent('"path": "ego.ego_name"');
    });
  },
};
