import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import Field from '@codaco/fresco-ui/form/Field/Field';
import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import { REQUIRED } from '../form/requiredField.ts';
import { FieldStoryHost } from '../testing/FieldStoryHost.tsx';
import DynamicTextField from './DynamicTextField.tsx';

/** The heading an anonymisation stage shows before asking for a passphrase. */
const TITLE_FIELD = 'explanationText.title';
const TITLE_LABEL = 'Title';
const INSERT_LABEL =
  'Inject piped text from interview metadata or a network attribute';

const title = (
  <Field<typeof DynamicTextField>
    name={TITLE_FIELD}
    component={DynamicTextField}
    label={TITLE_LABEL}
    required={REQUIRED}
    dynamicValues="stageText"
    compact
  />
);

const meta = {
  title: 'Protocol Builder/Fields/Text with values the interview fills in',
  component: FieldStoryHost,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Text a participant reads that can show values the interview fills in: the participant’s answers, the people a question is about, today’s date. What it can show depends on where the text sits. The syringe button (“Inject piped text from interview metadata or a network attribute”), or typing `{`, opens a searchable menu of those values; a chosen value shows as a chip among the words, and is bound to the stage under a short name when the stage is saved. A value that can be missing is inserted as a piece of text with one version for when it is known and one for when it is not, so the participant never meets a gap. Fields reach this through `LocalizedInputField` and `LocalizedRichTextField` with `dynamicValues` set.',
      },
    },
  },
  args: {
    stageId: 'anonymisation-1',
    sectionTitle: 'What the participant is told',
    children: title,
  },
  tags: ['autodocs'],
} satisfies Meta<typeof FieldStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Today's date is something any stage text can show. Chosen from the menu, it
 * arrives as a chip and a save binds it to the stage.
 */
export const InsertingAValue: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await awaitPassiveEffects();

    const editor = await canvas.findByRole('textbox', { name: TITLE_LABEL });
    await userEvent.click(editor);

    await userEvent.click(canvas.getByRole('button', { name: INSERT_LABEL }));
    const search = await body.findByRole('combobox', { name: 'Search' });
    await userEvent.type(search, 'today');
    await userEvent.keyboard('{Enter}');

    await waitFor(async () => {
      await expect(editor).toHaveTextContent('Today’s date');
    });

    await userEvent.click(canvas.getByRole('button', { name: 'Save stage' }));
    await waitFor(async () => {
      await expect(
        canvas.getByRole('status', { name: 'Save status' }),
      ).toHaveTextContent('"dynamicValues":');
    });
  },
};

/**
 * A value that can be missing arrives open, with the version that shows it
 * first and the one for when it is missing below it, in the pill's place.
 * Inserting it binds it to the stage, and undo still takes it back: the
 * editor keeps its history while the values it offers are reordered.
 */
export const UndoingAValue: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await awaitPassiveEffects();

    const editor = await canvas.findByRole('textbox', { name: TITLE_LABEL });
    await userEvent.click(editor);
    await userEvent.click(canvas.getByRole('button', { name: INSERT_LABEL }));
    const search = await body.findByRole('combobox', { name: 'Search' });
    await userEvent.type(search, 'ego_name');
    await userEvent.keyboard('{Enter}');

    const known = await canvas.findByRole('textbox', { name: 'If known' });
    const missing = canvas.getByRole('textbox', { name: 'If not known' });
    await expect(known.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      missing.getBoundingClientRect().top,
    );
    await expect(
      editor.querySelector('[data-versions-pill]'),
    ).not.toBeVisible();
    await waitFor(() => expect(editor).toHaveFocus());

    await userEvent.keyboard('{Control>}z{/Control}');
    await waitFor(() =>
      expect(editor.querySelector('[data-versions-element]')).toBeNull(),
    );
    await userEvent.keyboard('{Control>}{Shift>}z{/Shift}{/Control}');
    await waitFor(() =>
      expect(editor.querySelector('[data-versions-element]')).not.toBeNull(),
    );
  },
};

/** Held elsewhere: the text can be read, and nothing can be inserted. */
export const ASpectator: Story = {
  args: {
    readOnly: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    const editor = await canvas.findByRole('textbox', { name: TITLE_LABEL });
    await expect(editor).toHaveAttribute('contenteditable', 'false');
    await expect(
      canvas.getByRole('button', { name: INSERT_LABEL }),
    ).toBeDisabled();
  },
};
