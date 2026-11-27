import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';
import { withMod } from '@codaco/fresco-ui/testing/modKey';
import { fieldBlockMarkdown } from '@codaco/protocol-validation';

import { alterFormStageEditor } from '../../editors/alter-form/AlterFormStageEditor.ts';
import { egoFormStageEditor } from '../../editors/ego-form/EgoFormStageEditor.ts';
import { nameGeneratorStageEditor } from '../../editors/name-generator/NameGeneratorStageEditor.ts';
import StageEditor from '../../StageEditor.tsx';
import { chooseEditingLanguage } from '../../testing/chooseEditingLanguage.ts';
import {
  fixtureStageId,
  fixtureVariableId,
  loadFixtureStage,
} from '../../testing/protocolFixture.ts';
import { StageEditorStoryHost } from '../../testing/StageEditorStoryHost.tsx';
import { testId } from '../../testing/testId.ts';

const RELATIONSHIP = fixtureVariableId(
  { entity: 'node', typeName: 'person' },
  'relationship_to_ego',
);
const AGE = fixtureVariableId({ entity: 'node', typeName: 'person' }, 'age');
const RELATIONSHIP_FIELD = testId('story/field/relationship');
const AGE_FIELD = testId('story/field/age');

/** An alter form written as the participant reads it, in two languages. */
const ALTER_FORM = {
  type: 'AlterForm' as const,
  fields: {
    ...loadFixtureStage('alter-form-1').fields,
    form: {
      content: {
        'en-US': `# About this person\n\nTell us a little about each person that you named.\n\n${fieldBlockMarkdown(RELATIONSHIP_FIELD)}\n\n${fieldBlockMarkdown(AGE_FIELD)}`,
        'es': `# Sobre esta persona\n\nCuéntanos un poco sobre cada persona que nombraste.\n\n${fieldBlockMarkdown(RELATIONSHIP_FIELD)}`,
      },
      fields: [
        {
          id: RELATIONSHIP_FIELD,
          variable: RELATIONSHIP,
          prompt: {
            'en-US': 'How do you know this person?',
            'es': '¿De qué conoces a esta persona?',
          },
          hint: { 'en-US': 'For example, a friend or a colleague.' },
        },
        {
          id: AGE_FIELD,
          variable: AGE,
          prompt: { 'en-US': 'How old is this person?' },
        },
      ],
    },
  },
};

const BILINGUAL = { defaultLocale: 'en-US', locales: ['en-US', 'es'] };

const meta = {
  title: 'Protocol Builder/Sections/Form',
  component: StageEditorStoryHost,
  args: {
    stageId: testId('story/alter-form'),
    stage: ALTER_FORM,
    localization: BILINGUAL,
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
          'A form, written as one document in each language: its text, and a block for each question among its paragraphs. Each field block shows the question and hint that the researcher types in place, the attribute in its corner and the control that the participant answers with. Selecting a field opens its settings; the Field button (or Mod-Shift-F) adds a field and opens the list of attributes.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof StageEditorStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The form's editor. */
const formEditor = (canvasElement: HTMLElement) =>
  within(canvasElement).findByRole('textbox', { name: 'Form content' });

/** The frame of the field block for `fieldId`. */
const fieldFrame = (editor: HTMLElement, fieldId: string): HTMLElement => {
  const frame = editor.querySelector<HTMLElement>(
    `[data-field-id="${fieldId}"]`,
  );
  if (frame === null) throw new Error(`No field "${fieldId}"`);
  return frame;
};

/** Puts the caret at the end of a field's question. */
const caretInQuestion = async (editor: HTMLElement, fieldId: string) => {
  const label = fieldFrame(editor, fieldId).querySelector('[data-field-label]');
  if (label === null) throw new Error('No question');
  await userEvent.click(label);
  const range = label.ownerDocument.createRange();
  range.selectNodeContents(label);
  range.collapse(false);
  const selection = label.ownerDocument.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
};

/** The form as the researcher meets it: text, fields and their controls. */
export const Main: Story = {
  play: async ({ canvasElement }) => {
    await awaitPassiveEffects();
    const editor = await formEditor(canvasElement);
    await expect(editor).toHaveTextContent('About this person');
    const frame = fieldFrame(editor, RELATIONSHIP_FIELD);
    await expect(frame).toHaveTextContent('How do you know this person?');
    // At rest, a field is drawn as the participant meets it: its attribute
    // shows only in its tab, while it is selected or the pointer is over it.
    await expect(frame).not.toHaveTextContent('relationship_to_ego');
    // The control is a picture of what the participant answers with.
    const control = frame.querySelector('[data-field-control]');
    await expect(control).toHaveAttribute('inert');
    await expect(control?.querySelector('input')).not.toBeNull();
    // Selected, the field's tab shows its attribute and its settings button.
    await caretInQuestion(editor, RELATIONSHIP_FIELD);
    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(frame.querySelector('[data-block-tab]')).toHaveTextContent(
        'relationship_to_ego',
      ),
    );
    await expect(
      within(frame).getByRole('button', { name: 'Field settings' }),
    ).toBeVisible();
  },
};

/**
 * The Spanish form leaves out the age question. That is allowed, and the note
 * above the editor says so.
 */
export const SpanishWithNote: Story = {
  play: async ({ canvasElement }) => {
    await awaitPassiveEffects();
    const canvas = within(canvasElement);
    await formEditor(canvasElement);
    await expect(canvas.queryByText(/does not include/)).toBeNull();

    await chooseEditingLanguage(canvasElement, /español/);

    await expect(
      await canvas.findByText(/does not include 1 field/),
    ).toHaveTextContent('age');
    const editor = await formEditor(canvasElement);
    await expect(editor).toHaveTextContent('¿De qué conoces a esta persona?');
  },
};

/** A name generator's form, shown in a dialog with a title of its own. */
export const NameGeneratorDialogTitle: Story = {
  args: {
    stageId: fixtureStageId('name-generator-1'),
    stage: undefined,
    localization: undefined,
    renderEditor: ({ actions, ...editor }) => (
      <StageEditor
        {...editor}
        registry={nameGeneratorStageEditor}
        actions={actions}
      />
    ),
  },
  play: async ({ canvasElement }) => {
    await awaitPassiveEffects();
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole('textbox', { name: 'Dialog title' }),
    ).toHaveTextContent('Add a person');
    await formEditor(canvasElement);
  },
};

/** The ego form, whose heading and introduction are part of its text. */
export const EgoForm: Story = {
  args: {
    stageId: fixtureStageId('ego-form-1'),
    stage: undefined,
    localization: undefined,
    renderEditor: ({ actions, ...editor }) => (
      <StageEditor
        {...editor}
        registry={egoFormStageEditor}
        actions={actions}
      />
    ),
  },
};

/**
 * Chooses `attribute` in a new field's attribute list with Enter and types
 * `text` straight after it, in the same task: before the browser draws
 * another frame, as a quick typist can. Every key must reach the new field's
 * question.
 */
const chooseThenType = async (
  picker: HTMLElement,
  attribute: string,
  text: string,
) => {
  const search = within(picker).getByRole('combobox');
  await waitFor(() => expect(search).toHaveFocus());
  await userEvent.keyboard(attribute);
  await waitFor(() =>
    expect(
      picker.ownerDocument.getElementById(
        search.getAttribute('aria-activedescendant') ?? '',
      )?.textContent,
    ).toMatch(new RegExp(`^${attribute}`)),
  );
  // No pause between keys, so none of them waits for a frame either.
  await userEvent.setup({ delay: null }).keyboard(`{Enter}${text}`);
};

/** The Field button adds a field and lists the attributes beside the button. */
export const InsertFieldFromToolbar: Story = {
  play: async ({ canvasElement }) => {
    await awaitPassiveEffects();
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const editor = await formEditor(canvasElement);
    await caretInQuestion(editor, AGE_FIELD);

    await userEvent.click(canvas.getByRole('button', { name: 'Field' }));

    const picker = await body.findByRole('dialog', {
      name: 'Attribute of the new field',
    });
    await expect(picker).toHaveAttribute('data-picker-origin', 'toolbar');
    const added = picker.getAttribute('data-field-insert-picker') ?? '';
    await chooseThenType(picker, 'name', 'What is their name?');

    await waitFor(() =>
      expect(body.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    const frame = fieldFrame(editor, added);
    await expect(frame.querySelector('[data-field-label]')).toHaveTextContent(
      /^What is their name\?$/,
    );
    // Selected, the field shows its new attribute in its tab.
    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(frame.querySelector('[data-block-tab]')).toHaveTextContent(
        /^name/,
      ),
    );
  },
};

/** Mod-Shift-F adds a field at the caret and lists the attributes beside it. */
export const InsertFieldWithKeyboard: Story = {
  play: async ({ canvasElement }) => {
    await awaitPassiveEffects();
    const body = within(canvasElement.ownerDocument.body);
    const editor = await formEditor(canvasElement);
    await caretInQuestion(editor, AGE_FIELD);

    await userEvent.keyboard(withMod('{Shift>}f{/Shift}'));

    const picker = await body.findByRole('dialog', {
      name: 'Attribute of the new field',
    });
    await expect(picker).toHaveAttribute('data-picker-origin', 'block');
    const added = picker.getAttribute('data-field-insert-picker') ?? '';
    await expect(fieldFrame(editor, added)).toHaveAttribute(
      'data-indeterminate',
    );

    // Dismissed untouched, the new field goes again.
    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(
        editor.querySelector(`[data-field-id="${added}"]`),
      ).not.toBeInTheDocument(),
    );
  },
};

/**
 * Mod-Shift-F, then an attribute chosen in the list beside the new block:
 * the keys typed next go into the new field's question.
 */
export const InsertFieldWithKeyboardThenType: Story = {
  play: async ({ canvasElement }) => {
    await awaitPassiveEffects();
    const body = within(canvasElement.ownerDocument.body);
    const editor = await formEditor(canvasElement);
    await caretInQuestion(editor, AGE_FIELD);

    await userEvent.keyboard(withMod('{Shift>}f{/Shift}'));

    const picker = await body.findByRole('dialog', {
      name: 'Attribute of the new field',
    });
    await expect(picker).toHaveAttribute('data-picker-origin', 'block');
    const added = picker.getAttribute('data-field-insert-picker') ?? '';
    await chooseThenType(picker, 'name', 'What is their name?');

    await waitFor(() =>
      expect(body.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    await expect(
      fieldFrame(editor, added).querySelector('[data-field-label]'),
    ).toHaveTextContent(/^What is their name\?$/);
  },
};

/**
 * A selected field shows its settings button in its tab, and the settings
 * open from it (or from Enter on the selected field), not as the field is
 * selected.
 */
export const SettingsFromTheFieldsButton: Story = {
  play: async ({ canvasElement }) => {
    await awaitPassiveEffects();
    const body = within(canvasElement.ownerDocument.body);
    const editor = await formEditor(canvasElement);
    await caretInQuestion(editor, RELATIONSHIP_FIELD);

    await userEvent.keyboard('{Escape}');

    const frame = fieldFrame(editor, RELATIONSHIP_FIELD);
    await waitFor(() => expect(frame).toHaveAttribute('data-selected'));
    const button = await within(frame).findByRole('button', {
      name: 'Field settings',
    });
    await expect(body.queryByRole('dialog', { name: 'Field settings' })).toBe(
      null,
    );

    await userEvent.click(button);
    const settings = await body.findByRole('dialog', {
      name: 'Field settings',
    });
    // Attached to the button, on the side of it they say they are on.
    await waitFor(() => {
      const at = button.getBoundingClientRect();
      const shown = settings.getBoundingClientRect();
      expect(shown.height).toBeGreaterThan(0);
      const side = settings.getAttribute('data-side');
      const beside = {
        bottom: shown.top >= at.bottom,
        top: shown.bottom <= at.top,
        right: shown.left >= at.right,
        left: shown.right <= at.left,
      };
      expect(side !== null && side in beside).toBe(true);
      expect(beside[side as keyof typeof beside]).toBe(true);
    });
    // Focus is at the first of them.
    await waitFor(() =>
      expect(settings.contains(document.activeElement)).toBe(true),
    );
    await expect(
      within(settings).getByRole('combobox', { name: 'Input control' }),
    ).toBeInTheDocument();
    await expect(
      within(settings).getByRole('button', { name: 'Delete field' }),
    ).toBeInTheDocument();
  },
};

/**
 * A field moved into a logic block's branch, so the question is asked only
 * in some cases. A field moves by its handle, or by Mod-Shift-ArrowDown
 * while it is selected, which is what this drives.
 */
export const MoveFieldIntoLogicBranch: Story = {
  play: async ({ canvasElement }) => {
    await awaitPassiveEffects();
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const editor = await formEditor(canvasElement);

    // A logic block after the first field.
    await caretInQuestion(editor, RELATIONSHIP_FIELD);
    await userEvent.click(canvas.getByRole('button', { name: 'Logic block' }));
    await body.findByRole('dialog', { name: 'Logic block settings' });
    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(
        body.queryByRole('dialog', { name: 'Logic block settings' }),
      ).toBeNull(),
    );

    // The first field moves down into the logic block's first branch.
    await caretInQuestion(editor, RELATIONSHIP_FIELD);
    await userEvent.keyboard('{Escape}');
    await userEvent.keyboard(withMod('{Shift>}{ArrowDown}{/Shift}'));

    await waitFor(() =>
      expect(
        fieldFrame(editor, RELATIONSHIP_FIELD).closest('[data-logic-branches]'),
      ).not.toBeNull(),
    );
  },
};
