import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import StageEditor from '../../StageEditor.tsx';
import {
  fixtureLayoutId,
  fixtureStageId,
  fixtureTypeId,
  fixtureVariableId,
} from '../../testing/protocolFixture.ts';
import { StageEditorStoryHost } from '../../testing/StageEditorStoryHost.tsx';
import { storyDialogVisible } from '../../testing/storyDialogVisible.ts';
import { testId } from '../../testing/testId.ts';
import { narrativeStageEditor } from './NarrativeStageEditor.ts';

const meta = {
  title: 'Protocol Builder/Stage editors/Narrative',
  component: StageEditorStoryHost,
  args: {
    stageId: fixtureStageId('narrative-1'),
    // Through the dispatcher rather than by naming the component, so the story
    // also shows that this editor claims the interface its stage is of.
    renderEditor: ({ actions, ...editor }) => (
      <StageEditor
        {...editor}
        registry={narrativeStageEditor}
        actions={actions}
      />
    ),
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The canvas a participant is shown their own network on and asked to talk about it. Opened on the shared all-interfaces protocol: the node type and the attributes each preset positions, groups and highlights by come from that protocol’s codebook, and saving hands the whole stage to the host.',
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
      ).toHaveTextContent('Saved “Narrative (revised)”.');
    });
    await expect(
      canvas.getByRole('region', { name: 'What the host was asked to commit' }),
    ).toHaveTextContent('"label": { "en-US": "Narrative (revised)" }');
  },
};

/**
 * Each highlight of a preset carries the label the interview shows for it,
 * written in every language the protocol is in, and names the attribute it
 * reads.
 */
export const HighlightLabels: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    const [editPreset] = canvas.getAllByRole('button', { name: 'Edit preset' });
    if (editPreset === undefined) throw new Error('the stage has no preset');
    await userEvent.click(editPreset);

    const panel = await within(canvasElement.ownerDocument.body).findByRole(
      'dialog',
    );
    await storyDialogVisible(panel);
    const preset = within(panel);
    const highlight = within(
      preset.getByRole('group', { name: 'Highlight 1' }),
    );
    await expect(
      highlight.getByRole('textbox', { name: 'Highlight label' }),
    ).toHaveValue('Flagged');
    await expect(highlight.getByText('Attribute')).toBeVisible();
  },
};

const PERSON = fixtureTypeId('node', 'person');
const FAMILY_MEMBER = fixtureTypeId('node', 'family member');

/**
 * A stage that shows two node types. Each highlight of a preset has an
 * attribute picker for each type, and the grouping picker is replaced by a
 * sentence saying that groups need one node type.
 */
export const SeveralNodeTypes: Story = {
  args: {
    stageId: testId('several-types-narrative'),
    stage: {
      type: 'Narrative',
      fields: {
        label: { 'en-US': 'People and family' },
        subject: { entity: 'node', types: [PERSON, FAMILY_MEMBER] },
        background: { concentricCircles: 4, skewedTowardCenter: true },
        behaviours: { freeDraw: true, allowRepositioning: true },
        presets: [
          {
            id: testId('several-types-preset'),
            label: { 'en-US': 'Everyone' },
            layout: fixtureLayoutId('layout'),
            highlight: [
              {
                id: testId('several-types-highlight'),
                label: { 'en-US': 'Stands out' },
                attributes: [
                  {
                    id: testId('several-types-person'),
                    type: PERSON,
                    variable: fixtureVariableId(
                      { entity: 'node', typeName: 'person' },
                      'highlighted',
                    ),
                  },
                  {
                    id: testId('several-types-family'),
                    type: FAMILY_MEMBER,
                    variable: fixtureVariableId(
                      { entity: 'node', typeName: 'family member' },
                      'hasConditionX',
                    ),
                  },
                ],
              },
            ],
          },
        ],
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(
      canvas.getByRole('checkbox', { name: 'family member' }),
    ).toBeChecked();
    await userEvent.click(canvas.getByRole('button', { name: 'Edit preset' }));

    const panel = await within(canvasElement.ownerDocument.body).findByRole(
      'dialog',
    );
    await storyDialogVisible(panel);
    const preset = within(panel);
    await expect(
      preset.getByText(
        'Groups need one node type. This stage shows several node types, so its presets cannot group nodes.',
      ),
    ).toBeVisible();
    const highlight = within(
      preset.getByRole('group', { name: 'Highlight 1' }),
    );
    await expect(highlight.getByText('Attribute for person')).toBeVisible();
    await expect(
      highlight.getByText('Attribute for family member'),
    ).toBeVisible();
    await expect(
      highlight.getByRole('button', { name: 'Do not highlight family member' }),
    ).toBeVisible();
  },
};

/** Someone else holds the stage: every control is inert. */
export const Spectating: Story = {
  args: { readOnly: true },
};
