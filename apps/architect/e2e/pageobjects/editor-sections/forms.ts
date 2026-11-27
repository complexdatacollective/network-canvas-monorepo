import { expect, type Locator } from '@playwright/test';

// A stage's form is a rich text document (`@codaco/protocol-builder`'s
// `FormDocumentSection`, "Form"): text, with each field as a block in it.
// The toolbar's "Field" button puts a field in at the caret and opens the
// attribute picker ("Attribute of the new field") beside it; the new field's
// question is then typed into the block. Selecting a block (Escape from its
// text) and pressing Enter opens its settings ("Field settings"): the
// attribute, its input control, validation and "Delete field".
//
// The helpers take the enclosing section `Locator`
// (`editor.section('Form')`) and reach page-level popovers through
// `section.page()`, scoped by their own accessible names.

/** The document's own text box. */
export function formContent(section: Locator): Locator {
  return section.getByRole('textbox', { name: 'Form content', exact: true });
}

/** The document's field blocks, in order. */
export function fieldBlocks(section: Locator): Locator {
  return section.locator('[data-field-block-view]');
}

/** The field block whose question is `question`. */
export function fieldBlock(section: Locator, question: string): Locator {
  return fieldBlocks(section).filter({
    has: section.page().locator('[data-field-label]', { hasText: question }),
  });
}

/**
 * The key that moves the caret to the end of a text: Command-Down on macOS,
 * where Command-End does nothing in Chromium, and Control-End elsewhere.
 */
const TEXT_END =
  process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End';

/** Puts the caret at the end of the document, below its last block. */
export async function focusFormEnd(section: Locator): Promise<void> {
  await formContent(section).click();
  await section.page().keyboard.press(TEXT_END);
}

/**
 * Which kind of answer an input control collects: the type an attribute
 * created for that control is given. Every control belongs to exactly one
 * type (`VARIABLE_TYPE_COMPONENTS` in protocol-validation). Keys are the
 * control names (`collectableTypes.ts`'s `CONTROL_LABELS`), values the type
 * names that the picker offers.
 */
const VARIABLE_TYPE_FOR_CONTROL: Readonly<Record<string, string>> = {
  'Text Input': 'Text',
  'Text Area': 'Text',
  'Number Input': 'Number',
  'Boolean Choice': 'Boolean',
  'Toggle': 'Boolean',
  'Radio Group': 'Ordinal',
  'Likert Scale': 'Ordinal',
  'Checkbox Group': 'Categorical',
  'Toggle Button Group': 'Categorical',
  'Visual Analog Scale': 'Scalar',
  'Date Picker': 'Date',
  'Relative Date Picker': 'Date',
};

/** The input control each type's new attribute is given first. */
const DEFAULT_CONTROL_FOR_TYPE: Readonly<Record<string, string>> = {
  Text: 'Text Input',
  Number: 'Number Input',
};

/**
 * Adds a field at the end of the form, on an attribute that does not exist
 * yet: the "Field" button, the picker's create row and type step, then the
 * question typed into the new block. When `inputControl` is not the one a
 * new attribute of its type starts with, it is chosen in the field's
 * settings.
 */
export async function addFormField(
  section: Locator,
  opts: {
    variableName: string;
    promptText: string;
    /** A type the picker offers. Derived from `inputControl` when absent. */
    variableType?: string;
    /** A `CONTROL_LABELS` label allowed for that type. */
    inputControl?: string;
    /**
     * For a type that a name cannot finish (a list of values, a scale), which
     * opens the codebook's own editor: authors what it asks for beyond the
     * name (`authorOptions`), before "Create attribute" is pressed.
     */
    author?: (editor: Locator) => Promise<void>;
  },
): Promise<void> {
  const page = section.page();
  const inputControl = opts.inputControl ?? 'Text Input';
  const variableType =
    opts.variableType ?? VARIABLE_TYPE_FOR_CONTROL[inputControl];
  if (variableType === undefined) {
    throw new Error(
      `No codebook type is known for the input control "${inputControl}". Use one of the labels in CONTROL_LABELS (packages/protocol-builder/src/sections/collectableTypes.ts), or pass variableType.`,
    );
  }
  const before = await fieldBlocks(section).count();

  await focusFormEnd(section);
  await section.getByRole('button', { name: 'Field', exact: true }).click();
  const picker = page.getByRole('dialog', {
    name: 'Attribute of the new field',
    exact: true,
  });
  await picker
    .getByRole('combobox', { name: 'Find or create an attribute' })
    .fill(opts.variableName);
  await picker
    .getByRole('option', { name: `Create “${opts.variableName}”` })
    .click();
  await picker
    .getByRole('button', { name: new RegExp(`^${variableType}\\b`) })
    .click();
  if (opts.author !== undefined) {
    // The codebook's own editor, which opens with the name the list took.
    const editor = page.getByRole('dialog', {
      name: `New attribute: ${opts.variableName}`,
      exact: true,
    });
    await expect(
      editor.getByRole('textbox', { name: 'Attribute name', exact: true }),
    ).toHaveValue(opts.variableName);
    await opts.author(editor);
    await editor
      .getByRole('button', { name: 'Create attribute', exact: true })
      .click();
    await editor.waitFor({ state: 'detached' });
  }
  await expect(picker).toBeHidden();

  // The caret moves into the new block's question once the picker has
  // closed; what is typed before then does not reach it.
  await expect(fieldBlocks(section)).toHaveCount(before + 1);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const node = document.getSelection()?.anchorNode;
        const element = node instanceof Element ? node : node?.parentElement;
        return (
          document.activeElement?.getAttribute('role') === 'textbox' &&
          element?.closest('[data-field-label]') !== null &&
          element?.closest('[data-field-label]') !== undefined
        );
      }),
    )
    .toBe(true);
  await page.keyboard.type(opts.promptText);
  const block = fieldBlock(section, opts.promptText);
  await expect(block).toHaveCount(1);

  if (DEFAULT_CONTROL_FOR_TYPE[variableType] !== inputControl) {
    const settings = await openFieldSettings(section, opts.promptText);
    // Chosen from the keyboard: the list opens from the focused control,
    // typing moves to the option and Enter takes it.
    await settings.getByRole('combobox', { name: 'Input control' }).focus();
    await page.keyboard.press('Enter');
    const option = page.getByRole('option', {
      name: new RegExp(`^${inputControl}\\b`),
    });
    await expect(option).toBeAttached();
    await page.keyboard.type(inputControl);
    await expect(option).toHaveAttribute('data-highlighted', '');
    await page.keyboard.press('Enter');
    await expect(
      settings.getByRole('combobox', { name: 'Input control' }),
    ).toContainText(inputControl);
    await closeFieldSettings(section, settings);
  }
}

/**
 * The rich text editor that Tiptap draws on its own element, as far as these
 * helpers read it.
 */
type EditorElement = HTMLElement & {
  editor?: {
    state: { selection: { from: number } };
    view: {
      domAtPos: (position: number) => { node: Node };
      posAtDOM: (node: Node, offset: number) => number;
    };
  };
};

/**
 * Whether the editor's own selection, which it takes from the browser's a
 * moment after a click, is inside `region`.
 */
const editorSelectionIsIn = (region: Locator): Promise<boolean> =>
  region.evaluate((element) => {
    const editor = element.closest<EditorElement>('.ProseMirror')?.editor;
    if (editor === undefined) return false;
    const { node } = editor.view.domAtPos(editor.state.selection.from);
    return element.contains(node);
  });

/**
 * Opens the settings of the field that asks `question`, the way a keyboard
 * user does: in the question's text, Escape selects the block, and the
 * settings of a selected field open beside it.
 *
 * The editor takes a click's caret into its own selection a moment after
 * the click, and an Escape pressed before then finds the caret where it
 * was. So Escape is pressed once the editor's selection is in the question.
 */
export async function openFieldSettings(
  section: Locator,
  question: string,
): Promise<Locator> {
  const page = section.page();
  const block = fieldBlock(section, question);
  const label = block.locator('[data-field-label]');
  await label.click();
  await expect.poll(() => editorSelectionIsIn(label)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(block).toHaveAttribute('data-selected', /.*/);
  const settings = page.getByRole('dialog', {
    name: 'Field settings',
    exact: true,
  });
  await expect(settings).toBeVisible();
  return settings;
}

/**
 * Closes a field's settings, which are open for as long as the field is
 * selected, by moving the selection below the field with the Down arrow key.
 * The settings can cover the text, so the text is focused rather than
 * clicked.
 *
 * The editor moves a selected block's selection by the Down arrow itself,
 * from its own state, so the key works however soon it follows focus. A
 * caret move left to the browser (such as Command-Down) can be undone by the
 * editor as it takes focus. The block below can be another field, which is
 * then selected and whose settings open in the same place, so the key is
 * pressed once for each field that it selects, each time after the field
 * selected before it has been left.
 */
export async function closeFieldSettings(
  section: Locator,
  settings: Locator,
): Promise<void> {
  const text = formContent(section);
  const selected = fieldBlocks(section).and(
    section.page().locator('[data-selected]'),
  );
  await text.focus();
  await expect(text).toBeFocused();
  const fields = await fieldBlocks(section).count();
  for (let press = 0; press <= fields; press += 1) {
    // The selection is the editor's own, so it is read as it stands.
    if ((await selected.count()) === 0) break;
    const field = await selected.first().elementHandle();
    await section.page().keyboard.press('ArrowDown');
    await expect
      .poll(() =>
        field.evaluate((element) => element.hasAttribute('data-selected')),
      )
      .toBe(false);
    await field.dispose();
  }
  await expect(settings).toBeHidden();
}
