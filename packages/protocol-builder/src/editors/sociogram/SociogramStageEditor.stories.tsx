import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, screen, userEvent, waitFor, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import StageEditor from '../../StageEditor.tsx';
import {
  fixtureLayoutId,
  fixtureStageId,
  fixtureTypeId,
  fixtureVariableId,
} from '../../testing/protocolFixture.ts';
import { StageEditorStoryHost } from '../../testing/StageEditorStoryHost.tsx';
import { testId } from '../../testing/testId.ts';
import { sociogramStageEditor } from './SociogramStageEditor.ts';

const PERSON = fixtureTypeId('node', 'person');
const FAMILY_MEMBER = fixtureTypeId('node', 'family member');

const meta = {
  title: 'Protocol Builder/Stage editors/Sociogram',
  component: StageEditorStoryHost,
  args: {
    stageId: fixtureStageId('sociogram-1'),
    // Through the dispatcher rather than by naming the component, so the story
    // also shows that this editor claims the interface its stage is of.
    renderEditor: ({ actions, ...editor }) => (
      <StageEditor
        {...editor}
        registry={sociogramStageEditor}
        actions={actions}
      />
    ),
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The canvas a participant arranges their network on. Opened on the shared all-interfaces protocol: the node type and the attributes each prompt positions and marks by come from that protocol’s codebook, and saving hands the whole stage to the host.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof StageEditorStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Renaming a stage and saving it: the whole editor, end to end. */
export const Editing: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await userEvent.type(
      canvas.getByRole('textbox', { name: 'Stage name' }),
      ' (revised)',
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Save stage' }));

    await waitFor(async () => {
      await expect(
        canvas.getByRole('status', { name: 'Save status' }),
      ).toHaveTextContent('Saved “Sociogram (revised)”.');
    });
    await expect(
      canvas.getByRole('region', { name: 'What the host was asked to commit' }),
    ).toHaveTextContent('"label": { "en-US": "Sociogram (revised)" }');
  },
};

/**
 * Choosing what a prompt asks the participant to do. Each task shows only its
 * own settings: highlighting asks for the attribute it marks, and connecting
 * asks for the kind of connection it creates.
 */
export const ChoosingATask: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    const [editFirstPrompt] = canvas.getAllByRole('button', {
      name: 'Edit prompt',
    });
    if (editFirstPrompt === undefined) throw new Error('No prompt to edit.');
    await userEvent.click(editFirstPrompt);
    // The row dialog is portalled out of the canvas.
    const dialog = within(await screen.findByRole('dialog'));

    await userEvent.click(
      dialog.getByRole('option', { name: /Highlight nodes/u }),
    );
    await waitFor(async () => {
      await expect(dialog.getByText('Boolean attribute')).toBeVisible();
    });
    await expect(dialog.queryByText('Created edge type')).toBeNull();

    await userEvent.click(
      dialog.getByRole('option', { name: /Connect nodes/u }),
    );
    await waitFor(async () => {
      await expect(dialog.getByText('Created edge type')).toBeVisible();
    });
    await expect(dialog.queryByText('Boolean attribute')).toBeNull();
  },
};

/**
 * A stage that is the first to use its layout, in Manual mode, whose first
 * prompt connects nodes. No node is on the canvas when that prompt opens, so
 * the prompts section warns. Automatic mode places the nodes itself, and the
 * warning goes.
 */
export const FirstPromptIsNotAPositioningTask: Story = {
  args: {
    stageId: testId('first-use-sociogram'),
    // A layout of its own, which no earlier stage of the fixture uses.
    layouts: { [testId('who-knows-whom')]: { name: 'who_knows_whom' } },
    stage: {
      type: 'Sociogram',
      fields: {
        label: { 'en-US': 'Who knows whom' },
        subject: { entity: 'node', types: [PERSON] },
        background: { concentricCircles: 4, skewedTowardCenter: true },
        behaviours: {},
        layout: testId('who-knows-whom'),
        prompts: [
          {
            id: testId('first-use-prompt'),
            task: 'connect',
            text: { 'en-US': 'Link the people who know each other.' },
            edges: {
              create: fixtureTypeId('edge', 'knows'),
              display: [fixtureTypeId('edge', 'knows')],
            },
          },
        ],
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(
      await canvas.findByText('Nodes are not placed before this task'),
    ).toBeVisible();
    // The stage names a layout the codebook has, so the warning is the only
    // thing wrong with it.
    await expect(canvas.getAllByText(/who_knows_whom/u).length).toBeGreaterThan(
      0,
    );
    await expect(canvas.queryByText(/not in the codebook/u)).toBeNull();

    await userEvent.click(
      canvas.getByRole('option', { name: /^Automatic mode/u }),
    );
    await waitFor(async () => {
      await expect(
        canvas.queryByText('Nodes are not placed before this task'),
      ).toBeNull();
    });
  },
};

/**
 * A stage that shows two node types. The subject is a set of tick boxes, and
 * each prompt sets a highlight attribute and sort rules for each type, and the
 * order the types are handed over in.
 */
export const SeveralNodeTypes: Story = {
  args: {
    stageId: testId('several-types-sociogram'),
    stage: {
      type: 'Sociogram',
      fields: {
        label: { 'en-US': 'People and family' },
        subject: { entity: 'node', types: [PERSON, FAMILY_MEMBER] },
        background: { concentricCircles: 4, skewedTowardCenter: true },
        behaviours: { automaticLayout: true },
        layout: fixtureLayoutId('layout'),
        prompts: [
          {
            id: testId('several-types-prompt'),
            task: 'highlight',
            text: { 'en-US': 'Tap everyone you trust.' },
            highlight: [
              {
                id: testId('several-types-highlight'),
                type: PERSON,
                variable: fixtureVariableId(
                  { entity: 'node', typeName: 'person' },
                  'highlighted',
                ),
              },
            ],
            sortOrder: [
              {
                id: testId('several-types-sort'),
                type: FAMILY_MEMBER,
                property: fixtureVariableId(
                  { entity: 'node', typeName: 'family member' },
                  'fm_name',
                ),
                direction: 'asc',
              },
            ],
            nodeTypeOrder: [FAMILY_MEMBER, PERSON],
          },
        ],
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(
      canvas.getByRole('checkbox', { name: 'person' }),
    ).toBeChecked();
    await expect(
      canvas.getByRole('checkbox', { name: 'family member' }),
    ).toBeChecked();

    await userEvent.click(canvas.getByRole('button', { name: 'Edit prompt' }));
    const dialog = within(await screen.findByRole('dialog'));

    await waitFor(async () => {
      await expect(
        dialog.getByText('Boolean attribute for person'),
      ).toBeVisible();
    });
    await expect(
      dialog.getByText('Boolean attribute for family member'),
    ).toBeVisible();
    await expect(
      dialog.getByRole('switch', {
        name: 'Sort unplaced nodes of type person',
      }),
    ).not.toBeChecked();
    await expect(
      dialog.getByRole('switch', {
        name: 'Sort unplaced nodes of type family member',
      }),
    ).toBeChecked();
    await expect(dialog.getByText('Order of node types')).toBeVisible();
  },
};

/** Someone else holds the stage: every control is inert. */
export const Spectating: Story = {
  args: { readOnly: true },
};
