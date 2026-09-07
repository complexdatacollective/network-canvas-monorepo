import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import StageEditor from '../../StageEditor.tsx';
import { dispatchThroughPart } from '../../testing/incompleteRegistry.ts';
import { StageEditorStoryHost } from '../../testing/StageEditorStoryHost.tsx';
import { formStageEditors } from '../formStageEditors.ts';

const meta = {
  title: 'Protocol Builder/Stage editors/Information',
  component: StageEditorStoryHost,
  args: {
    stageId: 'information-1',
    // Through the dispatcher over this family's part alone, rather than by
    // naming the component, so the story also shows that this family claims
    // the interface its stage is of: every interface the part does not claim
    // refuses on the page instead of rendering.
    renderEditor: ({ controller, actions }) => (
      <StageEditor
        controller={controller}
        registry={dispatchThroughPart(formStageEditors)}
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
    ).toHaveTextContent('"label": "Welcome screen"');
  },
};

/** Someone else holds the lease: every control is inert and saving is refused. */
export const Spectating: Story = {
  args: { readOnly: true },
};
