import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';
import { dynamicValueNameFor } from '@codaco/protocol-validation';

import { ATTRIBUTE_MENU_LABEL } from '../../fields/dynamicText/AttributeMenuButton.tsx';
import StageEditor from '../../StageEditor.tsx';
import {
  fixtureStageId,
  fixtureVariableId,
} from '../../testing/protocolFixture.ts';
import { StageEditorStoryHost } from '../../testing/StageEditorStoryHost.tsx';
import { informationStageEditor } from './InformationStageEditor.ts';

const meta = {
  title: 'Protocol Builder/Stage editors/Information',
  component: StageEditorStoryHost,
  args: {
    stageId: fixtureStageId('information-1'),
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
          'The editor for a page the participant reads rather than a task they do: one text holding its heading, its words and its images, audio and video in the order they are read, plus the skip logic and interviewer guidance every stage carries. It is opened here over a real editing session holding the shared all-interfaces protocol.',
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
 * A value the interview fills in, inserted into the page: typing `{` opens
 * the Attribute menu, and choosing the participant's name writes it into the
 * text by its attribute's id.
 */
const EGO_NAME = dynamicValueNameFor({
  kind: 'attribute',
  role: 'ego',
  variableId: fixtureVariableId('ego', 'ego_name'),
});

export const ShowingAValue: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await awaitPassiveEffects();

    const page = await canvas.findByRole('textbox', {
      name: /^Rich Text/,
    });
    await userEvent.click(page);
    await userEvent.keyboard(' {{');
    const menu = within(
      await body.findByRole('dialog', { name: ATTRIBUTE_MENU_LABEL }),
    );
    await userEvent.click(menu.getByRole('option', { name: /^ego_name/ }));
    await waitFor(async () => {
      await expect(
        page.querySelector(`[data-inline-value="${EGO_NAME}"]`),
      ).not.toBeNull();
    });

    await userEvent.click(canvas.getByRole('button', { name: 'Save stage' }));
    await waitFor(async () => {
      await expect(
        canvas.getByRole('region', {
          name: 'What the host was asked to commit',
        }),
      ).toHaveTextContent(`{${EGO_NAME}}`);
    });
  },
};
