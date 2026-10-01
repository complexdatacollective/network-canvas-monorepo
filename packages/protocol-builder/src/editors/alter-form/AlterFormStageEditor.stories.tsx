import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import StageEditor from '../../StageEditor.tsx';
import { StageEditorStoryHost } from '../../testing/StageEditorStoryHost.tsx';
import { alterFormStageEditor } from './AlterFormStageEditor.ts';

const meta = {
  title: 'Protocol Builder/Stage editors/Per alter form',
  component: StageEditorStoryHost,
  args: {
    stageId: 'alter-form-1',
    renderEditor: ({ actions, ...editor }) => (
      <StageEditor
        {...editor}
        registry={alterFormStageEditor}
        actions={actions}
      />
    ),
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The editor for a form the participant fills in once for each person in their network. It opens with the node type the form collects into and an optional filter narrowing which of those people are asked about.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof StageEditorStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The editor as the researcher meets it, on a form that already collects two attributes. */
export const Editing: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    const name = canvas.getByRole('textbox', { name: 'Stage name' });
    await userEvent.clear(name);
    await userEvent.type(name, 'About each person');
    await userEvent.click(canvas.getByRole('button', { name: 'Save stage' }));

    await waitFor(async () => {
      await expect(
        canvas.getByRole('status', { name: 'Save status' }),
      ).toHaveTextContent('Saved “About each person”.');
    });
    await expect(
      canvas.getByRole('region', { name: 'What the host was asked to commit' }),
    ).toHaveTextContent('"label": "About each person"');
  },
};

/** Someone else holds the lease: every control is inert and saving is refused. */
export const Spectating: Story = {
  args: { readOnly: true },
};

const withinScrollPort = (element: Element) => {
  let port = element.parentElement;
  while (
    port !== null &&
    !['auto', 'scroll'].includes(getComputedStyle(port).overflowY)
  ) {
    port = port.parentElement;
  }
  if (port === null) throw new Error('the dialog has no scrolling region');
  const bounds = port.getBoundingClientRect();
  const { top, bottom } = element.getBoundingClientRect();
  return top >= bounds.top && bottom <= bounds.bottom;
};

const revealsTheValuesOfAnInventedAttribute = (control: string): Story => ({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await userEvent.click(
      canvas.getByRole('button', { name: 'Create new form field' }),
    );
    const dialog = within(
      await within(document.body).findByRole('dialog', {
        name: 'Create form field',
      }),
    );
    await userEvent.click(
      dialog.getByRole('button', { name: 'Select attribute' }),
    );
    const picker = within(
      await within(document.body).findByRole('dialog', { name: 'Attribute' }),
    );
    await userEvent.type(
      picker.getByRole('searchbox', { name: 'Find or create an attribute' }),
      'closeness',
    );
    await userEvent.click(
      picker.getByRole('option', {
        name: 'Create new attribute called “closeness”.',
      }),
    );
    await expect(
      await dialog.findByRole('button', { name: 'Change attribute' }),
    ).toBeInTheDocument();

    const select = dialog.getByRole('combobox', { name: 'Input control' });
    select.scrollIntoView({ block: 'end' });
    await userEvent.selectOptions(select, control);

    const values = await dialog.findByRole('heading', {
      name: 'Choice values',
    });
    await waitFor(async () => {
      await expect(withinScrollPort(values)).toBe(true);
    });
    await expect(withinScrollPort(select)).toBe(true);
    await expect(select).toHaveFocus();
  },
});

export const RevealingCategoricalValues: Story =
  revealsTheValuesOfAnInventedAttribute('Checkbox Group');

export const RevealingOrdinalValues: Story =
  revealsTheValuesOfAnInventedAttribute('Radio Group');
