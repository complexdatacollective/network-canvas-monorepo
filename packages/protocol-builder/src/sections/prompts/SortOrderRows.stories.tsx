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

const meta = {
  title: 'Protocol Builder/Sections/Sort rules by node type',
  component: StageEditorStoryHost,
  args: {
    stageId: testId('typed-sort-sociogram'),
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
            id: testId('typed-sort-prompt'),
            task: 'layout',
            text: { 'en-US': 'Place everyone.' },
            sortOrder: [
              {
                id: testId('typed-sort-person'),
                type: PERSON,
                property: fixtureVariableId(
                  { entity: 'node', typeName: 'person' },
                  'name',
                ),
                direction: 'asc',
              },
              {
                id: testId('typed-sort-family'),
                type: FAMILY_MEMBER,
                property: fixtureVariableId(
                  { entity: 'node', typeName: 'family member' },
                  'fm_name',
                ),
                direction: 'desc',
              },
            ],
          },
        ],
      },
    },
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
          'The sort rules of a Sociogram prompt on a stage that shows several node types: one group of rules for each type, each offering only that type’s attributes, and below them the order in which the types’ unplaced nodes are handed to the participant.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof StageEditorStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * One group of rules for each type, and the type order moved by keyboard:
 * the saved prompt names both types in the new order.
 */
export const GroupsAndTypeOrder: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await userEvent.click(canvas.getByRole('button', { name: 'Edit prompt' }));
    const dialog = within(await screen.findByRole('dialog'));

    await waitFor(async () => {
      await expect(
        dialog.getByRole('switch', {
          name: 'Sort unplaced nodes of type person',
        }),
      ).toBeChecked();
    });
    await expect(
      dialog.getByRole('switch', {
        name: 'Sort unplaced nodes of type family member',
      }),
    ).toBeChecked();
    await expect(dialog.getByText('Order of node types')).toBeVisible();

    const handle = dialog.getByRole('button', { name: 'Reorder item 1 of 2' });
    handle.focus();
    await userEvent.keyboard('{ArrowDown}');
    await userEvent.click(dialog.getByRole('button', { name: 'Save' }));
    await waitFor(async () => {
      await expect(screen.queryByRole('dialog')).toBeNull();
    });

    await userEvent.click(canvas.getByRole('button', { name: 'Save stage' }));
    const committed = canvas.getByRole('region', {
      name: 'What the host was asked to commit',
    });
    await waitFor(async () => {
      await expect(committed.textContent?.replace(/\s+/gu, '')).toContain(
        `"nodeTypeOrder":["${FAMILY_MEMBER}","${PERSON}"]`,
      );
    });
  },
};
