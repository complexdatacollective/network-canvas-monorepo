import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, screen, userEvent, waitFor, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import { sociogramStageEditor } from '../../editors/sociogram/SociogramStageEditor.ts';
import StageEditor from '../../StageEditor.tsx';
import {
  fixtureLayoutId,
  fixtureTypeId,
  fixtureVariableId,
} from '../../testing/protocolFixture.ts';
import { StageEditorStoryHost } from '../../testing/StageEditorStoryHost.tsx';
import { testId } from '../../testing/testId.ts';

const PERSON = fixtureTypeId('node', 'person');
const FAMILY_MEMBER = fixtureTypeId('node', 'family member');

const personSort = {
  id: testId('subject-story-sort-person'),
  type: PERSON,
  property: fixtureVariableId({ entity: 'node', typeName: 'person' }, 'name'),
  direction: 'asc',
};
const familySort = {
  id: testId('subject-story-sort-family'),
  type: FAMILY_MEMBER,
  property: fixtureVariableId(
    { entity: 'node', typeName: 'family member' },
    'fm_name',
  ),
  direction: 'desc',
};

const sociogram = (
  types: readonly string[],
  prompts: readonly Record<string, unknown>[],
) => ({
  type: 'Sociogram' as const,
  fields: {
    label: { 'en-US': 'People and family' },
    subject: { entity: 'node', types: [...types] },
    background: { concentricCircles: 4, skewedTowardCenter: true },
    behaviours: { automaticLayout: true },
    layout: fixtureLayoutId('layout'),
    prompts: [...prompts],
  },
});

const meta = {
  title: 'Protocol Builder/Sections/Node types of a Sociogram',
  component: StageEditorStoryHost,
  args: {
    stageId: testId('subject-story-sociogram'),
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
          'The node types a Sociogram shows, ticked in and out. Adding a type keeps everything the prompts say about the others. Removing one asks first when a prompt highlights or sorts it, and then removes only those settings. A removal that would leave a prompt unable to do its task is refused until that prompt is changed. Removing the last type asks first, because it leaves the stage with no node type and removes everything set up on it.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof StageEditorStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

const committed = (canvasElement: HTMLElement) =>
  within(canvasElement).getByRole('region', {
    name: 'What the host was asked to commit',
  });

/** Adding a type asks nothing and keeps the prompts as they are. */
export const AddingAType: Story = {
  args: {
    stage: sociogram(
      [PERSON],
      [
        {
          id: testId('subject-story-prompt'),
          task: 'layout',
          text: { 'en-US': 'Place everyone.' },
          sortOrder: [personSort],
        },
      ],
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(canvas.getByText('Node types')).toBeVisible();
    await userEvent.click(
      canvas.getByRole('checkbox', { name: 'family member' }),
    );
    await waitFor(async () => {
      await expect(
        canvas.getByRole('checkbox', { name: 'family member' }),
      ).toBeChecked();
    });
    await expect(screen.queryByRole('dialog')).toBeNull();
    await expect(
      canvas.getByRole('checkbox', { name: 'person' }),
    ).toBeChecked();
  },
};

/**
 * Removing a type a prompt sorts: the researcher is asked first, and only
 * that type's settings go.
 */
export const RemovingATypeThePromptsDescribe: Story = {
  args: {
    stage: sociogram(
      [PERSON, FAMILY_MEMBER],
      [
        {
          id: testId('subject-story-prompt'),
          task: 'layout',
          text: { 'en-US': 'Place everyone.' },
          sortOrder: [personSort, familySort],
          nodeTypeOrder: [FAMILY_MEMBER, PERSON],
        },
      ],
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await userEvent.click(
      canvas.getByRole('checkbox', { name: 'family member' }),
    );
    const question = within(await screen.findByRole('dialog'));
    await expect(question.getByText('Remove this node type?')).toBeVisible();
    await userEvent.click(
      question.getByRole('button', { name: 'Remove the node type' }),
    );
    await waitFor(async () => {
      await expect(
        canvas.getByRole('checkbox', { name: 'family member' }),
      ).not.toBeChecked();
    });

    await userEvent.click(canvas.getByRole('button', { name: 'Save stage' }));
    await waitFor(async () => {
      await expect(committed(canvasElement)).toHaveTextContent(
        personSort.property,
      );
    });
    await expect(committed(canvasElement)).not.toHaveTextContent(
      familySort.property,
    );
    await expect(committed(canvasElement)).not.toHaveTextContent(
      'nodeTypeOrder',
    );
  },
};

/** Removing a type no prompt mentions asks nothing. */
export const RemovingATypeNoPromptMentions: Story = {
  args: {
    stage: sociogram(
      [PERSON, FAMILY_MEMBER],
      [
        {
          id: testId('subject-story-prompt'),
          task: 'layout',
          text: { 'en-US': 'Place everyone.' },
          sortOrder: [personSort],
        },
      ],
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await userEvent.click(
      canvas.getByRole('checkbox', { name: 'family member' }),
    );
    await waitFor(async () => {
      await expect(
        canvas.getByRole('checkbox', { name: 'family member' }),
      ).not.toBeChecked();
    });
    await expect(screen.queryByRole('dialog')).toBeNull();
  },
};

/**
 * Removing the only type a highlight prompt highlights is refused, and the
 * researcher is told which prompt to change first.
 */
export const RemovalRefused: Story = {
  args: {
    stage: sociogram(
      [PERSON, FAMILY_MEMBER],
      [
        {
          id: testId('subject-story-prompt'),
          task: 'highlight',
          text: { 'en-US': 'Tap everyone you trust.' },
          highlight: [
            {
              id: testId('subject-story-highlight'),
              type: PERSON,
              variable: fixtureVariableId(
                { entity: 'node', typeName: 'person' },
                'highlighted',
              ),
            },
          ],
        },
      ],
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await userEvent.click(canvas.getByRole('checkbox', { name: 'person' }));
    const refusal = within(await screen.findByRole('dialog'));
    await expect(
      refusal.getByText('This node type cannot be removed yet'),
    ).toBeVisible();
    await expect(
      refusal.getByText(/^Prompt 1 highlights only this node type\./u),
    ).toBeVisible();
    await userEvent.click(refusal.getByRole('button', { name: 'Continue' }));
    await expect(
      canvas.getByRole('checkbox', { name: 'person' }),
    ).toBeChecked();
  },
};

/**
 * Unticking the last type asks whether to remove it, since the stage is then
 * left with no node type and everything set up on it is removed. Ticking a
 * type again afterwards asks nothing.
 */
export const RemovingTheLastType: Story = {
  args: {
    stage: sociogram(
      [PERSON],
      [
        {
          id: testId('subject-story-prompt'),
          task: 'layout',
          text: { 'en-US': 'Place everyone.' },
          sortOrder: [personSort],
        },
      ],
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await userEvent.click(canvas.getByRole('checkbox', { name: 'person' }));
    const question = within(await screen.findByRole('dialog'));
    await expect(
      question.getByText('Remove the last node type?'),
    ).toBeVisible();
    await expect(question.queryByText('Change node type?')).toBeNull();
    await userEvent.click(
      question.getByRole('button', { name: 'Remove the last node type' }),
    );
    await waitFor(async () => {
      await expect(
        canvas.getByRole('checkbox', { name: 'person' }),
      ).not.toBeChecked();
    });
    await expect(canvas.queryByText('Place everyone.')).toBeNull();

    // Ticking a type again starts the reset stage afresh, with nothing left
    // to lose, so it asks nothing.
    await userEvent.click(canvas.getByRole('checkbox', { name: 'person' }));
    await waitFor(async () => {
      await expect(
        canvas.getByRole('checkbox', { name: 'person' }),
      ).toBeChecked();
    });
    await expect(screen.queryByRole('dialog')).toBeNull();
  },
};
