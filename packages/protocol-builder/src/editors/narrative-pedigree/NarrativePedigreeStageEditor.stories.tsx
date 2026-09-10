import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import StageEditor from '../../StageEditor.tsx';
import { StageEditorStoryHost } from '../../testing/StageEditorStoryHost.tsx';
import { narrativePedigreeStageEditor } from './NarrativePedigreeStageEditor.ts';

const meta = {
  title: 'Protocol Builder/Stage editors/Narrative Pedigree',
  component: StageEditorStoryHost,
  args: {
    stageId: 'narrative-pedigree-1',
    // Through the dispatcher rather than by naming the component, so the story
    // also shows that this editor claims the interface its stage is of.
    renderEditor: ({ actions, ...editor }) => (
      <StageEditor
        {...editor}
        registry={narrativePedigreeStageEditor}
        actions={actions}
      />
    ),
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Conditions drawn onto a family the participant has already built. This stage has no family of its own: it names an earlier Family Pedigree stage, and every disease maps a boolean attribute of that stage’s node type — one a nomination prompt of it records, because a disease only reads. Opened on the shared all-interfaces protocol, so the pedigree on offer and the attributes behind the diseases are that protocol’s.',
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
      ).toHaveTextContent('Saved “Narrative Pedigree (revised)”.');
    });
    await expect(
      canvas.getByRole('region', { name: 'What the host was asked to commit' }),
    ).toHaveTextContent('"label": "Narrative Pedigree (revised)"');
  },
};

/**
 * The pedigrees this stage may read, numbered as the interview runs.
 *
 * The one control here that cannot be filled in from the stage document
 * alone: its choices are the Family Pedigree stages that precede this one, so
 * the story proves the interview's own order reached the picker.
 */
export const ChoosingThePedigree: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const picker = await canvas.findByRole('combobox', {
      name: 'Source stage',
    });
    await expect(
      within(picker).getByRole('option', {
        name: 'Stage 16 — Family Pedigree',
      }),
    ).toBeInTheDocument();
  },
};

/** Someone else holds the stage: every control is inert. */
export const Spectating: Story = {
  args: { readOnly: true },
};
