import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import StageEditor from '../../StageEditor.tsx';
import { StageEditorStoryHost } from '../../testing/StageEditorStoryHost.tsx';
import { familyPedigreeStageEditor } from './FamilyPedigreeStageEditor.ts';

const meta = {
  title: 'Protocol Builder/Stage editors/Family pedigree',
  component: StageEditorStoryHost,
  args: {
    stageId: 'family-pedigree-1',
    renderEditor: ({ actions, ...editor }) => (
      <StageEditor
        {...editor}
        registry={familyPedigreeStageEditor}
        actions={actions}
      />
    ),
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The editor for the stage a participant draws their family on: they select anyone on the canvas and add a parent, sibling, partner or child, describing each new person in a side panel. The researcher chooses the node type people are, writes the instruction shown on the canvas, binds the attributes the interface records about each person and each relationship, chooses the words used for family members, and may add further questions about each person, a completeness requirement, and nomination prompts: questions asked of the whole family once it is drawn.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof StageEditorStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A configured pedigree, every slot bound. */
export const Editing: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(
      await canvas.findByRole('heading', { name: 'Person attributes' }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole('heading', { name: 'Relationships' }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole('heading', { name: 'Wording' }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole('heading', { name: 'Nomination prompts' }),
    ).toBeInTheDocument();
  },
};

/**
 * The wording a participant reads for their family. A stage that stores
 * nothing uses everyday kinship words, which is drawn as the chosen card.
 */
export const Wording: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(
      await canvas.findByRole('option', { name: /^Everyday kinship words/ }),
    ).toHaveAttribute('aria-selected', 'true');
    await expect(
      canvas.getByRole('option', { name: /^Egg parent and sperm parent/ }),
    ).toHaveAttribute('aria-selected', 'false');
    await expect(
      canvas.getByRole('option', { name: /^Let the participant choose/ }),
    ).toBeInTheDocument();
  },
};

/**
 * Writing a nomination prompt: the question, the true/false attribute that
 * records who is selected, and an optional limit by sex assigned at birth,
 * which is open to anyone until the researcher says otherwise.
 */
export const AddingANominationPrompt: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await userEvent.click(
      await canvas.findByRole('button', {
        name: 'Create new nomination prompt',
      }),
    );

    // The dialog is drawn in a portal, outside the canvas.
    const dialog = within(await within(document.body).findByRole('dialog'));
    await expect(
      await dialog.findByRole('textbox', { name: 'Prompt text' }),
    ).toBeInTheDocument();
    await expect(
      await dialog.findByText('Attribute', { selector: 'label' }),
    ).toBeInTheDocument();
    await expect(
      dialog.getByRole('option', { name: 'Anyone' }),
    ).toHaveAttribute('aria-selected', 'true');
    await expect(
      dialog.getByRole('option', {
        name: 'Anyone except people assigned male at birth',
      }),
    ).toBeInTheDocument();
  },
};

/**
 * The gender identity options and their kinship words, edited together. The
 * stage shows each option's words read-only beside the button; the dialog it
 * opens is wide enough for a words choice beside each option's label and
 * value, and shows the attribute type read-only, because the stage only takes
 * a categorical one.
 */
export const EditingGenderIdentityOptions: Story = {
  globals: { appLocale: 'en' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    const summary = await canvas.findByRole('table', {
      name: 'Words for each gender identity',
    });
    await expect(
      within(summary).getByRole('row', { name: /^Woman/ }),
    ).toHaveTextContent('Feminine words (mother, sister)');

    await userEvent.click(canvas.getByRole('button', { name: 'Edit options' }));

    // The dialog is drawn in a portal, outside the canvas.
    const dialog = within(
      await within(document.body).findByRole('dialog', {
        name: 'Edit gender identity options',
      }),
    );
    await expect(
      dialog.getByRole('textbox', { name: 'Attribute type' }),
    ).toHaveAttribute('readonly');
    await expect(
      dialog.getByRole('combobox', { name: 'Option 1 kinship words' }),
    ).toHaveValue('feminine');
    await expect(
      dialog.getByRole('combobox', { name: 'Option 2 kinship words' }),
    ).toHaveValue('masculine');
  },
};

/** Someone else holds the lease: every control is inert and saving is refused. */
export const Spectating: Story = {
  args: { readOnly: true },
};
