import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import Field from '@codaco/fresco-ui/form/Field/Field';
import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';
import { withMod } from '@codaco/fresco-ui/testing/modKey';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { REQUIRED } from '../form/requiredField.ts';
import { FieldStoryHost } from '../testing/FieldStoryHost.tsx';
import DynamicTextField from './DynamicTextField.tsx';

/** The heading an information page shows above its content. */
const TITLE_FIELD = 'title';
const TITLE_LABEL = 'Page heading';
const INSERT_LABEL =
  'Inject piped text from interview metadata or a network attribute';
const UNREADABLE = 'Welcome, {name';

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
          'Text a participant reads that can show values the interview fills in: the participant’s answers, the people a question is about, today’s date. What it can show depends on where the text sits. The syringe button (“Inject piped text from interview metadata or a network attribute”), or typing `{`, opens a searchable menu of those values; a chosen value shows as a chip among the words, and is bound to the stage under a short name when the stage is saved. A value that can be missing is inserted as a piece of text with one version for when it is known and one for when it is not, so the participant never meets a gap. Fields reach this through `LocalizedInputField` and `LocalizedRichTextField` with `dynamicValues` set.',
      },
    },
  },
  args: {
    stageId: 'information-1',
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

    await userEvent.keyboard(withMod('z'));
    await waitFor(() =>
      expect(editor.querySelector('[data-versions-element]')).toBeNull(),
    );
    await userEvent.keyboard(withMod('{Shift>}z{/Shift}'));
    await waitFor(() =>
      expect(editor.querySelector('[data-versions-element]')).not.toBeNull(),
    );
  },
};

/**
 * A heading stored in words this field cannot read, as an imported or
 * hand-written protocol can hold. It is shown as it is rather than opened in
 * the editor, which would rewrite it, and the stage is not saved with it.
 */
export const AnUnreadableText: Story = {
  args: {
    seedEdit: (host) => {
      const stage = sectionId({ kind: 'stage', stageId: 'information-1' });
      const { document } = host.store.read(stage);
      host.store.applyAsCollaborator(stage, {
        ...document,
        [TITLE_FIELD]: { 'en-US': UNREADABLE },
      });
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(
      await canvas.findByText(
        'This text uses something Architect cannot show here, so it can’t be edited in this field. It is kept as it is.',
      ),
    ).toBeVisible();
    await expect(canvas.getByText(UNREADABLE)).toBeVisible();
    await expect(
      canvas.queryByRole('textbox', { name: TITLE_LABEL }),
    ).not.toBeInTheDocument();

    await userEvent.click(canvas.getByRole('button', { name: 'Save stage' }));
    await expect(
      await canvas.findByText(/Text is not valid message syntax/),
    ).toBeVisible();
    await expect(
      canvas.getByRole('status', { name: 'Save status' }),
    ).toHaveTextContent('Nothing saved yet.');
    await expect(canvas.getByText(UNREADABLE)).toBeVisible();
  },
};

/**
 * A heading that names a value which does not exist, as a hand-written
 * protocol can. The value keeps its place in the text as a pill drawn as a
 * problem, and the stage is not saved until it is replaced or removed.
 */
export const AMissingValue: Story = {
  args: {
    seedEdit: (host) => {
      const stage = sectionId({ kind: 'stage', stageId: 'information-1' });
      const { document } = host.store.read(stage);
      host.store.applyAsCollaborator(stage, {
        ...document,
        [TITLE_FIELD]: { 'en-US': 'Welcome, {nickname}' },
      });
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    const editor = await canvas.findByRole('textbox', { name: TITLE_LABEL });
    const pill = editor.querySelector('[data-token="nickname"]');
    await expect(pill).toHaveTextContent('Missing: nickname');
    await expect(pill).toHaveAttribute('data-variant', 'missing');

    await userEvent.click(canvas.getByRole('button', { name: 'Save stage' }));
    await waitFor(async () => {
      await expect(
        canvas.getAllByText(
          /This text refers to a value that does not exist: "nickname"\./,
        ).length,
      ).toBeGreaterThan(0);
    });
    await expect(
      canvas.getByRole('status', { name: 'Save status' }),
    ).toHaveTextContent('Nothing saved yet.');
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
