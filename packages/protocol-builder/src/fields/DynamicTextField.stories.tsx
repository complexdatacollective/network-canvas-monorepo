import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import Field from '@codaco/fresco-ui/form/Field/Field';
import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';
import { withMod } from '@codaco/fresco-ui/testing/modKey';

import { REQUIRED } from '../form/requiredField.ts';
import { FieldStoryHost } from '../testing/FieldStoryHost.tsx';
import { fixtureStageId } from '../testing/protocolFixture.ts';
import DynamicTextField from './DynamicTextField.tsx';

/** The heading a roster stage shows over the people it offers. */
const TITLE_FIELD = 'panelTitle';
const TITLE_LABEL = 'Panel heading';

const title = (
  <Field<typeof DynamicTextField>
    name={TITLE_FIELD}
    component={DynamicTextField}
    label={TITLE_LABEL}
    required={REQUIRED}
    dynamicValues="stageText"
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
          'Text that a participant reads, which can show values that the interview fills in: the participant’s answers, the people a question is about, today’s date, and the stage’s dynamic attributes. The Attribute button, or typing `{`, opens the list of what the text can show here, grouped by whose it is; a chosen value shows as a pill among the words. A dynamic attribute is a word or phrase that reads differently in different cases; its pill opens its settings. Text of several lines can also contain logic blocks: content that is shown only in some cases. Fields reach this through `LocalizedInputField` and `LocalizedRichTextField` with `dynamicValues` set.',
      },
    },
  },
  args: {
    stageId: fixtureStageId('name-generator-roster-1'),
    sectionTitle: 'What the participant is told',
    children: title,
  },
  tags: ['autodocs'],
} satisfies Meta<typeof FieldStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Today's date is something any stage text can show. Chosen from the
 * Attribute menu, it arrives as a pill, and a save writes it into the text.
 */
export const InsertingAValue: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await awaitPassiveEffects();

    const editor = await canvas.findByRole('textbox', { name: TITLE_LABEL });
    await userEvent.click(editor);
    await userEvent.click(canvas.getByRole('button', { name: 'Attribute' }));
    const menu = await body.findByRole('dialog', {
      name: 'Insert an attribute',
    });
    await expect(within(menu).getByText('Interview attributes')).toBeVisible();
    await userEvent.click(
      within(menu).getByRole('option', { name: /^Today’s date/ }),
    );

    await waitFor(async () => {
      await expect(
        editor.querySelector('[data-inline-value="now"]'),
      ).not.toBeNull();
    });

    await userEvent.click(canvas.getByRole('button', { name: 'Save stage' }));
    await waitFor(async () => {
      await expect(
        canvas.getByRole('status', { name: 'Save status' }),
      ).toHaveTextContent('{now}');
    });
  },
};

/** Undo takes back a value put in from the Attribute menu. */
export const UndoingAValue: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await awaitPassiveEffects();

    const editor = await canvas.findByRole('textbox', { name: TITLE_LABEL });
    await userEvent.click(editor);
    await userEvent.click(canvas.getByRole('button', { name: 'Attribute' }));
    await userEvent.click(
      await body.findByRole('option', { name: /^Today’s date/ }),
    );
    await waitFor(() =>
      expect(editor.querySelector('[data-inline-value="now"]')).not.toBeNull(),
    );
    await waitFor(() => expect(editor).toHaveFocus());

    await userEvent.keyboard(withMod('z'));
    await waitFor(() =>
      expect(editor.querySelector('[data-inline-value="now"]')).toBeNull(),
    );
    await userEvent.keyboard(withMod('{Shift>}z{/Shift}'));
    await waitFor(() =>
      expect(editor.querySelector('[data-inline-value="now"]')).not.toBeNull(),
    );
  },
};

/** Held elsewhere: the text can be read, and nothing can be put in. */
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
      canvas.getByRole('button', { name: 'Attribute' }),
    ).toHaveAttribute('aria-disabled', 'true');
  },
};
