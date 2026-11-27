import type { Meta, StoryObj } from '@storybook/react-vite';
import type { JSONContent } from '@tiptap/react';
import {
  Braces,
  Image as ImageIcon,
  Split,
  TextCursorInput,
} from 'lucide-react';
import { type ComponentProps, useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { Popover, PopoverContent, PopoverTrigger } from '../../Popover';
import { inlineValuesFor } from '../../testing/inlineValues';
import { withMod } from '../../testing/modKey';
import { cx } from '../../utils/cva';
import RichTextEditorField, {
  assetBlockFileProps,
  blockBoxProps,
  BlockDeleteButton,
  BlockSettingsButton,
  BlockTab,
  type RichTextAssetBlockViewProps,
  type RichTextFieldBlocks,
  type RichTextFieldBlockViewProps,
  type RichTextInsertState,
  type RichTextInsertTools,
  type RichTextLogicBlocks,
  type RichTextLogicBlockViewProps,
  type RichTextLogicBranchLabelProps,
  ToolbarButton,
  toolbarLabelledButtonStyles,
} from './RichTextEditor';

/**
 * The blocks a form's text holds (fields, logic blocks), the values among its
 * words, and the toolbar's insert tools. Everything drawn inside a block is
 * the consumer's: these stories draw plain stand-ins for what Architect
 * draws.
 */
const meta: Meta<typeof RichTextEditorField> = {
  title: 'Systems/Form/Fields/RichTextEditor/Sections',
  component: RichTextEditorField,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof meta>;

const LABELS = {
  first_name: 'first_name',
  employment_status: 'employment_status',
  employer: 'employer',
  today: 'Today’s date',
  name: 'name',
};

const values = inlineValuesFor(LABELS);

const pillClasses =
  'inline-flex items-center rounded-full border-2 border-current/30 px-3 text-sm leading-6 select-none';

/** A stand-in for Architect's field view: the label and hint, the attribute, the control. */
function StoryFieldView({
  attributes,
  content,
  selected,
  hovered,
  active,
}: RichTextFieldBlockViewProps) {
  const indeterminate = attributes.variable === '';
  const [open, setOpen] = useState(false);
  return (
    <div
      className="flex flex-col gap-4"
      data-field-required={indeterminate ? undefined : ''}
    >
      {(hovered || (selected && active) || open) && (
        <BlockTab selected={selected && active}>
          <span
            data-testid="field-attribute"
            className={cx(pillClasses, indeterminate && 'border-dashed italic')}
          >
            {indeterminate ? 'Choose an attribute' : attributes.variable}
          </span>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger
              nativeButton
              render={<BlockSettingsButton name="Field settings" />}
            />
            <PopoverContent align="end" aria-label="Field settings">
              <BlockDeleteButton>Delete field</BlockDeleteButton>
            </PopoverContent>
          </Popover>
        </BlockTab>
      )}
      <div className="min-w-0">{content}</div>
      <div
        contentEditable={false}
        aria-hidden
        className={cx(
          'h-12 rounded-full border-2 border-current/15',
          indeterminate && 'border-transparent bg-current/10',
        )}
      />
    </div>
  );
}

type StoryLogicMeta = Readonly<{ option: string }>;
type StoryBranchMeta = Readonly<{ label: string }>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const textAt = (value: unknown, key: string): string =>
  isRecord(value) && typeof value[key] === 'string' ? value[key] : '';

/** A stand-in for Architect's logic block header. */
function StoryLogicView({
  meta: logicMeta,
  content,
}: RichTextLogicBlockViewProps) {
  return (
    <>
      <div
        contentEditable={false}
        className="bg-info/10 border-info/40 flex items-center gap-2 border-b border-dashed px-4 py-2 text-sm select-none"
      >
        <Split aria-hidden className="text-info size-4" />
        <span className="text-info font-bold">Logic block</span>
        <span>{textAt(logicMeta, 'option')}</span>
      </div>
      {content}
    </>
  );
}

function StoryBranchLabel({ branch }: RichTextLogicBranchLabelProps) {
  return (
    <span className="text-info text-sm font-bold">
      {textAt(branch.meta, 'label') || branch.key}
    </span>
  );
}

function StoryAssetView({
  attributes,
  selected,
  hovered,
  active,
}: RichTextAssetBlockViewProps) {
  return (
    <div
      className="relative mx-auto flex h-40 w-96 items-center justify-center rounded-sm bg-current/10"
      {...assetBlockFileProps}
      {...blockBoxProps(true)}
    >
      <ImageIcon aria-hidden className="size-10 opacity-50" />
      <span className="sr-only">{attributes.assetId}</span>
      {(hovered || (selected && active)) && (
        <BlockTab selected={selected && active}>
          <BlockSettingsButton name="Image settings" />
        </BlockTab>
      )}
    </div>
  );
}

const ifElse = (option = 'If … else') => ({
  meta: { option } satisfies StoryLogicMeta,
  branches: [
    {
      key: 'if',
      meta: {
        label: 'If: employment_status includes Employed or Self-employed',
      } satisfies StoryBranchMeta,
    },
    {
      key: 'otherwise',
      meta: { label: 'Otherwise' } satisfies StoryBranchMeta,
    },
  ],
});

let createdFields = 0;

/** The toolbar's insert tools, as a form editor offers them. */
function StoryInsertTools({
  insert,
  withField,
}: Readonly<{ insert: RichTextInsertState; withField: boolean }>) {
  const { commands } = insert;
  const logic = ifElse();
  return (
    <>
      <ToolbarButton
        className={toolbarLabelledButtonStyles}
        disabled={!insert.editable}
        onClick={() => commands.insertInlineValue('name')}
      >
        <Braces aria-hidden />
        Attribute
      </ToolbarButton>
      {withField && (
        <ToolbarButton
          className={toolbarLabelledButtonStyles}
          disabled={!insert.canInsertSections}
          onClick={() => {
            createdFields += 1;
            commands.insertFieldBlock({
              fieldId: `story-field-${createdFields}`,
              variable: '',
            });
          }}
        >
          <TextCursorInput aria-hidden />
          Field
        </ToolbarButton>
      )}
      <ToolbarButton
        className={toolbarLabelledButtonStyles}
        disabled={!insert.canInsertSections}
        onClick={() => commands.insertLogicBlock(logic.meta, logic.branches)}
      >
        <Split aria-hidden />
        Logic block
      </ToolbarButton>
      {/* Opened by typing `{` at the caret: a value replaces it. */}
      <Popover
        open={insert.trigger !== null}
        onOpenChange={(open) => {
          if (!open) insert.trigger?.dismiss();
        }}
      >
        <PopoverContent
          anchor={insert.trigger?.anchor}
          aria-label="Insert an attribute"
          spacing="xs"
        >
          <div className="flex flex-col">
            {Object.entries(LABELS).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className="rounded-sm px-2 py-1 text-start hover:bg-current/10"
                onClick={() => commands.insertInlineValue(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}

const insertToolsFor = (withField: boolean): RichTextInsertTools => ({
  label: withField
    ? 'Insert an attribute, field or logic block'
    : 'Insert an attribute or logic block',
  render: function renderInsertTools(insert: RichTextInsertState) {
    return <StoryInsertTools insert={insert} withField={withField} />;
  },
});

const fieldBlock = (
  fieldId: string,
  variable: string,
  label: string,
  hint = '',
): JSONContent => ({
  type: 'fieldBlock',
  attrs: { fieldId, variable, showValidationHints: false },
  content: [
    { type: 'fieldLabel', content: [{ type: 'text', text: label }] },
    hint === ''
      ? { type: 'fieldHint' }
      : { type: 'fieldHint', content: [{ type: 'text', text: hint }] },
  ],
});

const words = (text: string): JSONContent => ({ type: 'text', text });
const paragraph = (...content: JSONContent[]): JSONContent =>
  content.length === 0 ? { type: 'paragraph' } : { type: 'paragraph', content };

/** The approved mockup's form: text, values, fields, a logic block, a file. */
const aboutYou: JSONContent = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [words('About you')] },
    paragraph(
      words('Please answer the questions below about your situation on '),
      { type: 'inlineValue', attrs: { id: 'today' } },
      words('.'),
    ),
    fieldBlock(
      'f1',
      'first_name',
      'What is your first name?',
      'We use your first name only during this interview.',
    ),
    fieldBlock(
      'f2',
      'employment_status',
      'What is your employment status?',
      'Choose every option that applies to you.',
    ),
    {
      type: 'logicBlock',
      attrs: { meta: ifElse().meta },
      content: [
        {
          type: 'logicBranch',
          attrs: ifElse().branches[0],
          content: [
            {
              type: 'heading',
              attrs: { level: 2 },
              content: [words('Your work')],
            },
            fieldBlock(
              'f3',
              'employer',
              'Who is your employer?',
              'If you are self-employed, enter the name of your business.',
            ),
          ],
        },
        {
          type: 'logicBranch',
          attrs: ifElse().branches[1],
          content: [paragraph()],
        },
      ],
    },
    {
      type: 'assetBlock',
      attrs: {
        assetId: 'network',
        description: '',
        size: null,
        autoplay: true,
        loop: true,
      },
    },
  ],
};

const storyFieldBlocks = (
  onInsert: RichTextFieldBlocks['onInsert'] = () => undefined,
): RichTextFieldBlocks => ({
  View: StoryFieldView,
  createId: () => {
    createdFields += 1;
    return `story-field-${createdFields}`;
  },
  onInsert,
  labelPlaceholder: 'Type the question',
  hintPlaceholder: 'Add a hint (optional)',
});

const storyLogicBlocks: RichTextLogicBlocks = {
  View: StoryLogicView,
  BranchLabel: StoryBranchLabel,
  emptyBranchText: 'Nothing is shown.',
};

/** A form editor as wide as Architect's, showing the document it holds. */
function FormEditor({
  initial,
  label = 'Form',
  withFields = true,
  width = 'w-[56rem]',
  ...props
}: Omit<
  ComponentProps<typeof RichTextEditorField>,
  'value' | 'onChange' | 'id' | 'name'
> & {
  initial: JSONContent;
  label?: string;
  withFields?: boolean;
  /** How wide the editor is drawn, as a class. */
  width?: string;
}) {
  const [value, setValue] = useState<JSONContent | undefined>(initial);
  const [inserted, setInserted] = useState<string | null>(null);
  return (
    <div className={cx('flex flex-col gap-4', width)}>
      <RichTextEditorField
        id={label}
        name={label}
        aria-label={label}
        changeMode="input"
        toolbarOptions={{ links: true, thematicBreak: true }}
        inlineValues={values}
        {...(withFields && {
          fieldBlocks: storyFieldBlocks((event) => setInserted(event.fieldId)),
        })}
        logicBlocks={storyLogicBlocks}
        assetBlocks={{
          pick: (kind) => Promise.resolve(`${kind}-1`),
          View: StoryAssetView,
        }}
        insertTools={insertToolsFor(withFields)}
        value={value}
        onChange={setValue}
        {...props}
      />
      <output data-testid="inserted" hidden>
        {inserted}
      </output>
      <pre data-testid={`${label} value`} hidden>
        {JSON.stringify(value)}
      </pre>
    </div>
  );
}

const documentIn = (canvasElement: HTMLElement, label = 'Form'): JSONContent =>
  JSON.parse(
    within(canvasElement).getByTestId(`${label} value`).textContent || 'null',
  ) as JSONContent;

/** The types of the document's own blocks, in order. */
const blockTypes = (document: JSONContent): (string | undefined)[] =>
  (document.content ?? []).map((node) => node.type);

/** Puts the caret at the start or end of `element`'s text. */
const caretIn = (element: Element, at: 'start' | 'end') => {
  const range = element.ownerDocument.createRange();
  range.selectNodeContents(element);
  range.collapse(at === 'start');
  const selection = element.ownerDocument.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
};

/** Sends a key to the editor, as ProseMirror hears one. */
const press = (
  editor: HTMLElement,
  key: string,
  keyCode: number,
  modifiers: Readonly<{ shift?: boolean }> = {},
) => {
  const event = new KeyboardEvent('keydown', {
    key,
    shiftKey: modifiers.shift ?? false,
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(event, 'keyCode', { value: keyCode });
  editor.dispatchEvent(event);
};

/**
 * A form as one document: its text, its fields (each a block whose question
 * and hint are typed in place) and a logic block whose branch holds a field.
 * Enter moves from a field's question to its hint and on to a new line;
 * Escape selects the whole field; Mod-Shift-F puts in a new field at the
 * caret, indeterminate until its attribute is chosen.
 */
export const FieldBlocks: Story = {
  render: () => <FormEditor initial={aboutYou} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const editor = await canvas.findByRole('textbox', { name: 'Form' });
    const label = () => {
      const found = editor.querySelector(
        '[data-field-id="f1"] [data-field-label]',
      );
      if (found === null) throw new Error('No label');
      return found;
    };
    await waitFor(() =>
      expect(label()).toHaveTextContent('What is your first name?'),
    );
    // A required field's question is marked, as the interview marks it.
    await expect(getComputedStyle(label(), '::after').content).toContain('*');

    await userEvent.click(label());
    caretIn(label(), 'end');
    press(editor, 'Enter', 13);
    await waitFor(() => {
      const selection = editor.ownerDocument.getSelection();
      const anchor = selection?.anchorNode;
      const element =
        anchor instanceof Element ? anchor : (anchor?.parentElement ?? null);
      expect(element?.closest('[data-field-hint]')).not.toBeNull();
    });

    // Escape selects the whole field.
    press(editor, 'Escape', 27);
    const frame = editor.querySelector('[data-field-id="f1"]');
    await waitFor(() => expect(frame).toHaveAttribute('data-selected'));

    // Mod-Shift-F puts in a new, indeterminate field after it.
    await userEvent.keyboard(withMod('{Shift>}f{/Shift}'));
    const inserted = await canvas.findByTestId('inserted');
    await waitFor(() => expect(inserted.textContent).not.toBe(''));
    const added = editor.querySelector(
      `[data-field-id="${inserted.textContent}"]`,
    );
    await expect(added).toHaveAttribute('data-indeterminate');
    await expect(added?.querySelector('[data-field-label]')).toHaveAttribute(
      'data-placeholder',
      'Type the question',
    );
    await expect(blockTypes(documentIn(canvasElement))).toEqual([
      'heading',
      'paragraph',
      'fieldBlock',
      'fieldBlock',
      'fieldBlock',
      'logicBlock',
      'assetBlock',
    ]);
  },
};

/**
 * Content shown only in some cases: a logic block's branches hold any blocks,
 * and a branch that holds nothing says so. The Logic block button puts one in
 * at the caret, selected.
 */
export const LogicBlocks: Story = {
  render: () => (
    <FormEditor
      label="Page content"
      withFields={false}
      initial={{
        type: 'doc',
        content: [
          paragraph(words('Please tell us about your work or your studies.')),
        ],
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const editor = await canvas.findByRole('textbox', { name: 'Page content' });
    await userEvent.click(editor);
    caretIn(editor.querySelector('p') ?? editor, 'end');

    await expect(
      canvas.queryByRole('button', { name: 'Field' }),
    ).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Logic block' }));

    const block = await waitFor(() => {
      const found = editor.querySelector('[data-logic-block-view]');
      if (found === null) throw new Error('No logic block');
      return found;
    });
    await waitFor(() => expect(block).toHaveAttribute('data-selected'));
    const branches = block.querySelectorAll('[data-logic-branch-view]');
    await expect(branches).toHaveLength(2);
    // An empty branch says that nothing is shown.
    const empty = branches[1]?.querySelector('p');
    if (!(empty instanceof HTMLElement)) throw new Error('No empty line');
    await expect(getComputedStyle(empty, '::before').content).toBe(
      '"Nothing is shown."',
    );
    await expect(blockTypes(documentIn(canvasElement, 'Page content'))).toEqual(
      ['paragraph', 'logicBlock', 'paragraph'],
    );
  },
};

/**
 * Values among the words, drawn by the consumer. The Attribute button puts
 * one in at the caret; so does typing `{` and choosing one.
 */
export const InlineValues: Story = {
  render: () => (
    <FormEditor
      label="Page content"
      withFields={false}
      initial={{ type: 'doc', content: [paragraph(words('Thanks, '))] }}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const editor = await canvas.findByRole('textbox', { name: 'Page content' });
    await userEvent.click(editor);
    caretIn(editor.querySelector('p') ?? editor, 'end');

    await userEvent.click(canvas.getByRole('button', { name: 'Attribute' }));
    await waitFor(() =>
      expect(editor.querySelector('[data-inline-value="name"]')).not.toBeNull(),
    );
    await waitFor(() => expect(editor).toHaveFocus());

    // Typed, `{` asks for a value at the caret, and the value replaces it.
    await userEvent.keyboard('{{');
    await userEvent.click(
      await body.findByRole('button', { name: 'employer' }),
    );
    await waitFor(() =>
      expect(
        editor.querySelector('[data-inline-value="employer"]'),
      ).not.toBeNull(),
    );
    await expect(editor.textContent).not.toContain('{');
  },
};

/**
 * The toolbar's buttons sit next to each other, with a thin rule between
 * groups, and the insert tools (Attribute, Field, Logic block) come after
 * the formatting groups and before the buttons for files.
 */
export const ToolbarWithoutSpacers: Story = {
  // Wide enough for the toolbar to be one line.
  render: () => <FormEditor initial={aboutYou} width="w-[72rem]" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole('textbox', { name: 'Form' });
    const toolbar = canvas.getByRole('toolbar');
    const box = (name: string) =>
      within(toolbar).getByRole('button', { name }).getBoundingClientRect();

    // Neighbours in a group touch.
    for (const [before, after] of [
      ['Undo', 'Redo'],
      ['Bold', 'Italic'],
      ['Bullet list', 'Numbered list'],
      ['Attribute', 'Field'],
      ['Field', 'Logic block'],
      ['Insert image', 'Insert audio'],
    ] as const) {
      await expect(
        Math.abs(box(after).left - box(before).right),
        `${before} ${after}`,
      ).toBeLessThan(0.5);
    }
    // Between groups there is a rule, and room for it.
    const dividers = toolbar.querySelectorAll('[data-toolbar-divider]');
    await expect(dividers.length).toBeGreaterThan(4);
    await expect(box('Bold').left - box('Undo').right).toBeGreaterThan(8);
    // The insert tools come after the formatting and before the files.
    const button = (name: string) =>
      within(toolbar).getByRole('button', { name });
    const follows = (before: string, after: string) =>
      Boolean(
        button(before).compareDocumentPosition(button(after)) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    await expect(follows('Insert emoji', 'Attribute')).toBe(true);
    await expect(follows('Logic block', 'Insert image')).toBe(true);
  },
};

/** A control of a toolbar, where it is drawn, and the rule before it. */
type DrawnControl = Readonly<{
  name: string | null;
  left: number;
  right: number;
  middle: number;
  space: number;
  rule: Readonly<{ left: number; right: number }> | undefined;
}>;

/**
 * Makes `frame` `width` wide and waits until the toolbar inside it has laid
 * its lines out for that width: the toolbar is told of its new size by a
 * `ResizeObserver` it made when it was drawn, and one made after it is told
 * after it, in the same round.
 */
const resizeAndWait = (frame: HTMLElement, toolbar: Element, width: number) =>
  new Promise<void>((resolve) => {
    frame.style.width = `${width}px`;
    const resized = new ResizeObserver(() => {
      resized.disconnect();
      resolve();
    });
    resized.observe(toolbar);
  });

/**
 * Where the field is narrower than its toolbar, the toolbar wraps a control
 * at a time, the insert tools (Attribute, Field, Logic block) included. Each
 * line starts at the bar's edge with a control, not cut off and not with a
 * rule; a rule is drawn only between two controls of a line; and a line is
 * full, so the control that starts the next one would not have fitted at
 * its end.
 */
export const ToolbarWrapsAControlAtATime: Story = {
  render: () => (
    <div data-testid="frame" className="w-[56rem]">
      <FormEditor initial={aboutYou} width="w-full" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole('textbox', { name: 'Form' });
    const frame = canvas.getByTestId('frame');
    const toolbar = canvas.getByRole('toolbar');
    const clip = toolbar.firstElementChild;
    if (!(clip instanceof HTMLElement)) throw new Error('No toolbar line');

    let wrapped = 0;
    let insertToolsSplit = 0;
    for (let width = 896; width >= 320; width -= 8) {
      await resizeAndWait(frame, toolbar, width);
      const shown: DOMRect = clip.getBoundingClientRect();
      const padding = Number.parseFloat(getComputedStyle(clip).paddingLeft);
      const start = shown.left + padding;
      const end = shown.right - padding;
      // As wide as the narrowest space with a rule in it.
      const ruleSpace = Math.min(
        ...Array.from(
          toolbar.querySelectorAll('[data-toolbar-divider]'),
          (divider) => divider.getBoundingClientRect().width,
        ).filter((space) => space > 0),
      );
      const controls = Array.from(toolbar.querySelectorAll('button')).map(
        (button): DrawnControl => {
          const box = button.getBoundingClientRect();
          const before = button.previousElementSibling;
          const divider =
            before instanceof HTMLElement &&
            before.hasAttribute('data-toolbar-divider')
              ? before
              : undefined;
          const rule = divider?.firstElementChild?.getBoundingClientRect();
          return {
            name: button.getAttribute('aria-label') ?? button.textContent,
            left: box.left,
            right: box.right,
            middle: (box.top + box.bottom) / 2,
            // The space a group's first control needs before it, for its rule.
            space: divider === undefined ? 0 : ruleSpace,
            // A rule is seen where it is inside what the bar shows of itself.
            rule:
              rule !== undefined &&
              rule.width > 0 &&
              rule.right > shown.left &&
              rule.left < shown.right
                ? { left: rule.left, right: rule.right }
                : undefined,
          };
        },
      );
      const lines: DrawnControl[][] = [];
      for (const control of controls) {
        const line = lines.find(
          ([first]) =>
            first !== undefined && Math.abs(first.middle - control.middle) < 4,
        );
        if (line === undefined) lines.push([control]);
        else line.push(control);
      }
      if (lines.length > 1) wrapped += 1;
      const lineOf = (name: string) =>
        lines.findIndex((line) => line.some((c) => c.name === name));
      if (lineOf('Attribute') !== lineOf('Field')) insertToolsSplit += 1;

      for (const [index, line] of lines.entries()) {
        const at = `at ${width}px, line ${index + 1}: ${line.map((c) => c.name).join(', ')}`;
        const first = line[0];
        const last = line.at(-1);
        if (first === undefined || last === undefined) continue;
        await expect(Math.abs(first.left - start), at).toBeLessThan(0.5);
        await expect(last.right, at).toBeLessThanOrEqual(end + 0.5);
        for (const { rule, name } of line) {
          if (rule === undefined) continue;
          await expect(
            line.some((c) => c.right <= rule.left + 0.5),
            `${at}: a control before the rule at ${name}`,
          ).toBe(true);
          await expect(
            line.some((c) => c.left >= rule.right - 0.5),
            `${at}: a control after the rule at ${name}`,
          ).toBe(true);
        }
        const next = lines[index + 1]?.[0];
        if (next !== undefined) {
          await expect(
            last.right + next.space + (next.right - next.left),
            `${at}: ${next.name} would have fitted`,
          ).toBeGreaterThan(end);
        }
      }
    }
    // The widths tried include ones where the toolbar wraps, and ones where
    // the insert tools are on two lines.
    await expect(wrapped).toBeGreaterThan(10);
    await expect(insertToolsSplit).toBeGreaterThan(0);
  },
};

/** The section `selector` finds in the editor. */
const sectionIn = (editor: HTMLElement, selector: string): HTMLElement => {
  const found = editor.querySelector(selector);
  if (!(found instanceof HTMLElement)) throw new Error(`No ${selector}`);
  return found;
};

/**
 * Moves the pointer to (`x`, `y`) of the window, as a mouse does, over
 * whatever is drawn there.
 */
const pointTo = (document: Document, x: number, y: number) => {
  const target = document.elementFromPoint(x, y) ?? document.body;
  target.dispatchEvent(
    new PointerEvent('pointermove', {
      bubbles: true,
      clientX: x,
      clientY: y,
      pointerType: 'mouse',
    }),
  );
};

/**
 * Moves the pointer over `element`: its middle, or a little in from its top
 * (where a logic block draws its heading rather than another block).
 */
const pointAt = (element: Element, where: 'middle' | 'top' = 'middle') => {
  const box = element.getBoundingClientRect();
  pointTo(
    element.ownerDocument,
    box.left + box.width / 2,
    where === 'top' ? box.top + 8 : box.top + box.height / 2,
  );
};

/** The editor's drag handle, drawn beside the block under the pointer. */
const visibleHandle = (editor: Element): HTMLElement => {
  const handle = editor
    .closest('[data-block-frames-host]')
    ?.querySelector('[data-block-handle]');
  if (!(handle instanceof HTMLElement)) throw new Error('No drag handle');
  return handle;
};

/**
 * The handle of `section`, with the pointer over it (see `pointAt`): beside
 * it, level with it. The block under the pointer has no frame.
 */
const handleOf = async (
  editor: Element,
  section: Element,
  where: 'middle' | 'top' = 'middle',
): Promise<HTMLElement> => {
  pointAt(section, where);
  return waitFor(() => {
    const handle = visibleHandle(editor);
    const grip = handle.getBoundingClientRect();
    const box = section.getBoundingClientRect();
    expect(grip.top).toBeGreaterThanOrEqual(box.top - grip.height / 2);
    expect(grip.bottom).toBeLessThanOrEqual(box.bottom + grip.height / 2);
    expect(
      editor
        .closest('[data-block-frames-host]')
        ?.querySelector('[data-block-frame="hovered"]'),
    ).toBeFalsy();
    return handle;
  });
};

/**
 * The points of `element` (its middle, and a pixel in from the middle of each
 * edge: the corners are rounded off) where the pointer reaches something
 * else, which covers or clips it there.
 */
const unreachedPointsOf = (element: HTMLElement): string[] => {
  const box = element.getBoundingClientRect();
  if (box.width < 24 || box.height < 24) return ['smaller than 24px'];
  const middleX = box.left + box.width / 2;
  const middleY = box.top + box.height / 2;
  const points = {
    middle: [middleX, middleY],
    left: [box.left + 1, middleY],
    right: [box.right - 1, middleY],
    top: [middleX, box.top + 1],
    bottom: [middleX, box.bottom - 1],
  } as const;
  return Object.entries(points).flatMap(([name, [x, y]]) => {
    const hit = element.ownerDocument.elementFromPoint(x, y);
    return hit !== null && element.contains(hit) ? [] : [name];
  });
};

/** Sends a pointer event at (`x`, `y`) of the window, as a mouse does. */
const pointer = (
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  on: EventTarget,
  x: number,
  y: number,
) =>
  on.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      button: 0,
      buttons: type === 'pointerup' ? 0 : 1,
    }),
  );

/**
 * Picks `section` up by its handle, from whatever the pointer reaches at the
 * handle's middle, and moves the pointer in steps to (`x`, `y`). Returns
 * what lets it go there.
 */
const pickUpByHandle = async (
  editor: Element,
  section: Element,
  to: Readonly<{ x: number; y: number }>,
  where: 'middle' | 'top' = 'middle',
) => {
  const from = (await handleOf(editor, section, where)).getBoundingClientRect();
  const x = from.left + from.width / 2;
  const y = from.top + from.height / 2;
  const grabbed = section.ownerDocument.elementFromPoint(x, y);
  if (grabbed === null) throw new Error('Nothing under the handle');
  const page = section.ownerDocument;
  pointer('pointerdown', grabbed, x, y);
  const steps = 12;
  for (let step = 1; step <= steps; step += 1) {
    pointer(
      'pointermove',
      page,
      x + ((to.x - x) * step) / steps,
      y + ((to.y - y) * step) / steps,
    );
  }
  return () => pointer('pointerup', page, to.x, to.y);
};

/**
 * Drags `section` by its handle and drops it just inside the top of
 * `target`'s text: before `target`.
 */
const dragByHandle = async (
  editor: Element,
  section: Element,
  target: Element,
  where: 'middle' | 'top' = 'middle',
) => {
  const to = target.getBoundingClientRect();
  const drop = await pickUpByHandle(
    editor,
    section,
    { x: to.left + 2, y: to.top + 2 },
    where,
  );
  drop();
};

/**
 * A field or logic block is moved by its handle, or with Mod-Shift-ArrowUp
 * and Mod-Shift-ArrowDown while it is selected (or while the caret is in a
 * field's question or hint): down past the text, into a logic block's
 * branch, and out again.
 */
export const DragSectionBlock: Story = {
  // Not centred: the editor stays where it is as the drag changes its height.
  parameters: { layout: 'padded' },
  render: () => <FormEditor initial={aboutYou} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const editor = await canvas.findByRole('textbox', { name: 'Form' });
    const label = editor.querySelector(
      '[data-field-id="f2"] [data-field-label]',
    );
    if (label === null) throw new Error('No label');
    // The handle shows while the field is under the pointer.
    await userEvent.hover(label);
    await userEvent.click(label);
    caretIn(label, 'end');
    press(editor, 'Escape', 27);

    // Down: into the logic block's first branch, at its start.
    await userEvent.keyboard(withMod('{Shift>}{ArrowDown}{/Shift}'));
    await waitFor(() => {
      const branch = documentIn(canvasElement).content?.[3]?.content?.[0];
      expect(branch?.content?.[0]?.attrs?.fieldId).toBe('f2');
    });
    await expect(blockTypes(documentIn(canvasElement))).toEqual([
      'heading',
      'paragraph',
      'fieldBlock',
      'logicBlock',
      'assetBlock',
    ]);

    // Up: out again, where it was.
    await userEvent.keyboard(withMod('{Shift>}{ArrowUp}{/Shift}'));
    await waitFor(() =>
      expect(documentIn(canvasElement).content?.[3]?.attrs?.fieldId).toBe('f2'),
    );

    // Every handle can be reached by the pointer, the whole of it: a
    // paragraph's, a field's, a logic block's, and that of a field inside a
    // logic block's branch.
    const para = sectionIn(editor, ':scope > p');
    const field = sectionIn(editor, '[data-field-id="f1"]');
    const block = sectionIn(editor, '[data-logic-block-view]');
    const nested = sectionIn(editor, '[data-field-id="f3"]');
    for (const [name, section, where] of [
      ['paragraph', para, 'middle'],
      ['field', field, 'middle'],
      ['logic block', block, 'top'],
      ['field in a branch', nested, 'middle'],
    ] as const) {
      const handle = await handleOf(editor, section, where);
      await expect(unreachedPointsOf(handle), name).toEqual([]);
    }

    // Dragged by its handle from where the pointer reaches it: the logic
    // block to the top of the form, then the field in its branch out of it.
    const heading = () => {
      const found = editor.querySelector(':scope > h1');
      if (found === null) throw new Error('No heading');
      return found;
    };
    await dragByHandle(editor, block, heading(), 'top');
    await waitFor(() =>
      expect(blockTypes(documentIn(canvasElement))).toEqual([
        'logicBlock',
        'heading',
        'paragraph',
        'fieldBlock',
        'fieldBlock',
        'assetBlock',
      ]),
    );
    await dragByHandle(
      editor,
      sectionIn(editor, '[data-field-id="f3"]'),
      heading(),
    );
    await waitFor(() => {
      const moved = documentIn(canvasElement);
      expect(blockTypes(moved)).toEqual([
        'logicBlock',
        'fieldBlock',
        'heading',
        'paragraph',
        'fieldBlock',
        'fieldBlock',
        'assetBlock',
      ]);
      expect(moved.content?.[1]?.attrs?.fieldId).toBe('f3');
    });
  },
};

/** The box that a logic block's branch is written in. */
const branchBoxOf = (branch: Element): HTMLElement => {
  const box = branch.querySelector('[data-logic-branch-content]');
  if (!(box instanceof HTMLElement)) throw new Error('No branch box');
  return box;
};

/** Sends a mouse event at the middle of the left part of `element`. */
const mouseAt = (
  type: 'mousedown' | 'mouseup',
  element: Element,
  inset = 20,
) => {
  const box = element.getBoundingClientRect();
  element.dispatchEvent(
    new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: box.left + inset,
      clientY: box.top + box.height / 2,
      button: 0,
      buttons: type === 'mousedown' ? 1 : 0,
      view: window,
    }),
  );
};

/** Presses and lets go at the middle of the left part of `element`. */
const clickAt = (element: Element, inset = 20) => {
  mouseAt('mousedown', element, inset);
  mouseAt('mouseup', element, inset);
};

/**
 * Each branch of a logic block is written in a box of its own under its
 * label, as wide as the block, with a thin border. The box is not a block:
 * the blocks in it have handles, but the pointer over a branch that shows
 * nothing shows only the logic block's handle, and its empty line has none.
 * While the logic block is selected, a press in a branch's text puts the
 * caret there, so that the browser cannot pick the logic block up from
 * inside one of its branches.
 */
export const LogicBranchesAreNotBlocks: Story = {
  // Not centred: the editor stays where it is as the selection changes.
  parameters: { layout: 'padded' },
  render: () => <FormEditor initial={aboutYou} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const editor = await canvas.findByRole('textbox', { name: 'Form' });
    await editor.ownerDocument.fonts.ready;
    const block = sectionIn(editor, '[data-logic-block-view]');
    const branches = Array.from(
      block.querySelectorAll('[data-logic-branch-view]'),
    );
    await expect(branches).toHaveLength(2);
    const [written, empty] = branches;
    if (written === undefined || empty === undefined) {
      throw new Error('No branches');
    }

    // Boxes as wide as the block, inside its 2px border and 16px padding,
    // each under its label.
    const blockBox = block.getBoundingClientRect();
    for (const branch of branches) {
      const box = branchBoxOf(branch);
      const style = getComputedStyle(box);
      await expect(style.borderTopStyle).toBe('solid');
      await expect(style.borderTopWidth).toBe('1px');
      const drawn = box.getBoundingClientRect();
      await expect(Math.round(drawn.left - blockBox.left)).toBe(18);
      await expect(Math.round(blockBox.right - drawn.right)).toBe(18);
      const label = branch.querySelector(':scope > [contenteditable="false"]');
      await expect(label?.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        drawn.top,
      );
    }

    // A block in a branch has its handle, in the box's gutter.
    const nested = sectionIn(editor, '[data-field-id="f3"]');
    const nestedGrip = (await handleOf(editor, nested)).getBoundingClientRect();
    await expect(nestedGrip.left).toBeGreaterThan(
      branchBoxOf(written).getBoundingClientRect().left,
    );

    // Over the branch that shows nothing: the logic block's own handle,
    // beside the block's top, and none for the branch.
    pointAt(branchBoxOf(empty));
    await waitFor(() => {
      const grip = visibleHandle(editor).getBoundingClientRect();
      expect(Math.round(blockBox.left - grip.left)).toBe(40);
      expect(Math.round(grip.top)).toBe(Math.round(blockBox.top));
    });

    // Its empty line, selected, has no handle either.
    const host = editor.closest('[data-block-frames-host]');
    if (host === null) throw new Error('No frames host');
    const line = branchBoxOf(empty).querySelector('p');
    if (line === null) throw new Error('No empty line');
    host.dispatchEvent(new PointerEvent('pointerleave'));
    await userEvent.click(line);
    caretIn(line, 'start');
    press(editor, 'Escape', 27);
    await waitFor(() => expect(line).toHaveClass('ProseMirror-selectednode'));
    await waitFor(() =>
      expect(host.querySelector('[data-block-handle]')).toBeNull(),
    );

    // The logic block, selected by a click on its heading. Found afresh
    // each time: the editor can draw it again as the selection changes.
    const logicBlock = () => sectionIn(editor, '[data-logic-block-view]');
    const selectTheLogicBlock = async () => {
      const heading = logicBlock().querySelector('[contenteditable="false"]');
      if (heading === null) throw new Error('No heading');
      clickAt(heading);
      await waitFor(() =>
        expect(logicBlock()).toHaveAttribute('data-selected'),
      );
    };
    await selectTheLogicBlock();

    // A press in a branch's text puts the caret there. ProseMirror makes
    // what a press would drag draggable; nothing is.
    const title = logicBlock().querySelector('h2');
    if (title === null) throw new Error('No title');
    mouseAt('mousedown', title);
    await expect(title.draggable).toBe(false);
    await waitFor(() =>
      expect(logicBlock(), 'pressed in the text').not.toHaveAttribute(
        'data-selected',
      ),
    );
    mouseAt('mouseup', title);
  },
};

/** One editor whose language can be switched, each language its own document. */
function LanguageSwitchingEditor() {
  const [language, setLanguage] = useState<'English' | 'Spanish'>('English');
  const [documents, setDocuments] = useState<
    Record<'English' | 'Spanish', JSONContent | undefined>
  >({ English: aboutYou, Spanish: { type: 'doc', content: [paragraph()] } });
  return (
    <div className="flex w-[56rem] flex-col gap-4">
      <div className="flex gap-2">
        {(['English', 'Spanish'] as const).map((each) => (
          <button
            key={each}
            type="button"
            aria-pressed={language === each}
            className="rounded-sm border px-3 py-1 aria-pressed:font-bold"
            onClick={() => setLanguage(each)}
          >
            {each}
          </button>
        ))}
      </div>
      <RichTextEditorField
        // Switching the language draws the editor afresh.
        key={language}
        id={`form-${language}`}
        name={`form-${language}`}
        aria-label={`Form in ${language}`}
        changeMode="input"
        inlineValues={values}
        fieldBlocks={storyFieldBlocks()}
        logicBlocks={storyLogicBlocks}
        assetBlocks={{ View: StoryAssetView }}
        value={documents[language]}
        onChange={(next) =>
          setDocuments((current) => ({ ...current, [language]: next }))
        }
      />
      {(['English', 'Spanish'] as const).map((each) => (
        <pre key={each} data-testid={`${each} value`} hidden>
          {JSON.stringify(documents[each])}
        </pre>
      ))}
    </div>
  );
}

/**
 * Each language's form is its own document. Copying the whole English form
 * and pasting it into the empty Spanish one carries every block: text, values,
 * fields with their ids, the logic block with its branches, and the file.
 */
export const CopyBetweenLanguages: Story = {
  render: () => <LanguageSwitchingEditor />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const english = await canvas.findByRole('textbox', {
      name: 'Form in English',
    });
    await userEvent.click(english);
    await userEvent.keyboard(withMod('a'));
    const clipboardData = new DataTransfer();
    english.dispatchEvent(
      new ClipboardEvent('copy', {
        bubbles: true,
        cancelable: true,
        clipboardData,
      }),
    );
    await expect(clipboardData.getData('text/html')).toContain(
      'data-field-block',
    );

    await userEvent.click(canvas.getByRole('button', { name: 'Spanish' }));
    const spanish = await canvas.findByRole('textbox', {
      name: 'Form in Spanish',
    });
    await userEvent.click(spanish);
    await userEvent.keyboard(withMod('a'));
    spanish.dispatchEvent(
      new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData,
      }),
    );

    await waitFor(() =>
      expect(documentIn(canvasElement, 'Spanish')).toEqual(
        documentIn(canvasElement, 'English'),
      ),
    );
    await expect(
      spanish.querySelectorAll('[data-field-block-view]'),
    ).toHaveLength(3);
  },
};

/**
 * A stand-in for Architect's field view whose settings stay open while the
 * field is selected, as Architect's do, drawn where the toolbar's link
 * popover opens (under the "Add link" button), so the two overlap.
 */
function FieldWithSettingsView(props: RichTextFieldBlockViewProps) {
  const { selected, element } = props;
  // Looked for while selected: the toolbar is drawn by then.
  const linkButton = selected
    ? (element()?.ownerDocument.querySelector('[aria-label="Add link"]') ??
      null)
    : null;
  return (
    <>
      <StoryFieldView {...props} />
      <Popover open={selected && linkButton !== null}>
        <PopoverContent
          anchor={linkButton}
          side="bottom"
          align="start"
          aria-label="Stand-in popup"
          className="h-64 w-96"
        >
          <p>A popup of the selected field</p>
        </PopoverContent>
      </Popover>
    </>
  );
}

/**
 * The popup opened last is drawn on top, whenever each was mounted. A
 * stand-in popup here stays open while a field is selected; the toolbar's
 * link popover, mounted with the editor (before it) and kept mounted while it
 * is closed, opens after it, and is drawn over it where the two overlap.
 */
export const LastOpenedPopupOnTop: Story = {
  render: () => (
    <FormEditor
      initial={aboutYou}
      fieldBlocks={{ ...storyFieldBlocks(), View: FieldWithSettingsView }}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const editor = await canvas.findByRole('textbox', { name: 'Form' });
    const label = editor.querySelector(
      '[data-field-id="f1"] [data-field-label]',
    );
    if (label === null) throw new Error('No label');
    await userEvent.click(label);
    caretIn(label, 'end');
    press(editor, 'Escape', 27);
    const settings = await page.findByRole('dialog', {
      name: 'Stand-in popup',
    });

    await userEvent.click(canvas.getByRole('button', { name: 'Add link' }));
    const link = await page.findByRole('dialog', { name: 'Add link' });

    await waitFor(() => {
      const box = link.getBoundingClientRect();
      const x = box.left + box.width / 2;
      const y = box.top + box.height / 2;
      // Both are open, and the settings are under the link popover there.
      const under = settings.getBoundingClientRect();
      expect(settings).toBeVisible();
      expect(
        x > under.left && x < under.right && y > under.top && y < under.bottom,
        'the settings reach the middle of the link popover',
      ).toBe(true);
      const hit = link.ownerDocument.elementFromPoint(x, y);
      expect(
        hit !== null && link.contains(hit),
        'the link popover is drawn on top there',
      ).toBe(true);
    });
  },
};

/**
 * In an editor that is not told the text's direction, a field's question and
 * hint each read in the direction of their own first letter, as the
 * paragraphs around them do.
 */
export const QuestionsReadInTheirOwnDirection: Story = {
  render: () => (
    <FormEditor
      initial={{
        type: 'doc',
        content: [
          paragraph(words('مرحبا')),
          fieldBlock('f1', 'first_name', 'ما اسمك؟', 'اسمك الأول فقط.'),
        ],
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const editor = await canvas.findByRole('textbox', { name: 'Form' });
    const lines = [
      editor.querySelector('p'),
      editor.querySelector('[data-field-label]'),
      editor.querySelector('[data-field-hint]'),
    ];
    for (const line of lines) {
      if (line === null) throw new Error('A line is missing');
      await expect(getComputedStyle(line).unicodeBidi).toBe('plaintext');
    }
  },
};

/** Every kind of block: a heading, paragraphs, a list, a rule, a field, a logic block and a file. */
const everyBlock: JSONContent = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 1 },
      content: [words('About you')],
    },
    paragraph(words('Before the interview, please have these ready:')),
    {
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [paragraph(words('your address'))] },
        { type: 'listItem', content: [paragraph(words('your work hours'))] },
      ],
    },
    { type: 'horizontalRule' },
    fieldBlock('f1', 'first_name', 'What is your first name?', ''),
    {
      type: 'logicBlock',
      attrs: { meta: ifElse().meta },
      content: [
        {
          type: 'logicBranch',
          attrs: ifElse().branches[0],
          content: [paragraph(words('Thank you for working with us.'))],
        },
        {
          type: 'logicBranch',
          attrs: ifElse().branches[1],
          content: [paragraph()],
        },
      ],
    },
    {
      type: 'assetBlock',
      attrs: {
        assetId: 'network',
        description: '',
        size: null,
        autoplay: true,
        loop: true,
      },
    },
    paragraph(words('Thank you.')),
  ],
};

/** The frame drawn over an editor: the one for the selected block. */
const frameOf = (editor: Element, which: 'selected') =>
  editor
    .closest('[data-block-frames-host]')
    ?.querySelector(`[data-block-frame="${which}"]`) ?? null;

/** Where each of the editor's blocks is drawn, for comparing layouts. */
const blockBoxes = (editor: Element) =>
  Array.from(editor.children, (child) => {
    const { top, left, width, height } = child.getBoundingClientRect();
    return { top, left, width, height };
  });

/** The blocks of `everyBlock`, as the editor draws them, by name. */
const blocksOf = (editor: HTMLElement) =>
  ({
    heading: sectionIn(editor, ':scope > h1'),
    paragraph: sectionIn(editor, ':scope > p'),
    list: sectionIn(editor, ':scope > ul'),
    rule: sectionIn(editor, ':scope > hr'),
    field: sectionIn(editor, '[data-field-block-view]'),
    logic: sectionIn(editor, '[data-logic-block-view]'),
    file: sectionIn(editor, '[data-block-box]'),
  }) as const;

/**
 * At rest, nothing marks the blocks: no frame, no handle, no tab, and a field
 * shows no attribute. The document is laid out as the participant reads it.
 */
export const BlockFramesAtRest: Story = {
  render: () => <FormEditor initial={everyBlock} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const editor = await canvas.findByRole('textbox', { name: 'Form' });
    const host = editor.closest('[data-block-frames-host]');
    await expect(host).not.toBeNull();
    await expect(host?.querySelector('[data-block-frame]')).toBeNull();
    await expect(host?.querySelector('[data-block-handle]')).toBeNull();
    await expect(host?.querySelector('[data-block-tab]')).toBeNull();
    await expect(canvas.queryByTestId('field-attribute')).toBeNull();
    // A field has no border or padding of its own.
    const field = blocksOf(editor).field;
    const style = getComputedStyle(field);
    await expect(style.borderTopWidth).toBe('0px');
    await expect(style.paddingTop).toBe('0px');
  },
};

/**
 * The pointer over any block shows its handle in the gutter before it, 40px
 * before its start, and draws no frame round it; a field and a file also
 * show their tab (the field's attribute and settings button), and the
 * attribute keeps clear of the tab's rounded end. Nothing in the document
 * moves.
 */
export const BlockFramesOnHover: Story = {
  render: () => <FormEditor initial={everyBlock} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const editor = await canvas.findByRole('textbox', { name: 'Form' });
    await editor.ownerDocument.fonts.ready;
    const atRest = blockBoxes(editor);
    const blocks = blocksOf(editor);
    const host = editor.closest('[data-block-frames-host]');
    for (const [name, block] of Object.entries(blocks)) {
      const handle = await handleOf(
        editor,
        block,
        name === 'logic' ? 'top' : 'middle',
      );
      await expect(
        host?.querySelector('[data-block-frame]'),
        `${name} has no frame`,
      ).toBeNull();
      const box = block.getBoundingClientRect();
      const grip = handle.getBoundingClientRect();
      await expect(Math.round(box.left - grip.left), name).toBe(40);
      const tab = editor.querySelector('[data-block-tab]');
      if (name === 'field' || name === 'file') {
        await expect(tab, `${name} has a tab`).not.toBeNull();
        // On the frame's top edge, outside the block.
        await expect(tab?.getBoundingClientRect().bottom).toBeLessThan(
          box.top + 2,
        );
      } else {
        await expect(tab, `${name} has no tab`).toBeNull();
      }
      await expect(blockBoxes(editor), `${name} moved nothing`).toEqual(atRest);
    }
    // The field's attribute shows only while the pointer is over the field,
    // and keeps 8px or more from the start of its tab's border.
    pointAt(blocks.field);
    const attribute = await canvas.findByTestId('field-attribute');
    await expect(attribute).toHaveTextContent('first_name');
    const tab = attribute.closest('[data-block-tab]');
    if (tab === null) throw new Error('No tab');
    await expect(
      attribute.getBoundingClientRect().left - tab.getBoundingClientRect().left,
    ).toBeGreaterThanOrEqual(8);
    pointAt(blocks.paragraph);
    await waitFor(() =>
      expect(canvas.queryByTestId('field-attribute')).toBeNull(),
    );
  },
};

/**
 * Escape in a block's text selects the block. A selected paragraph or
 * heading shows no frame (the selection marks it); a selected block of any
 * other kind shows one in the primary colour, round the whole of it: round
 * a list's markers too, whose handle stands where every other block's does.
 * Mod-Shift-ArrowDown and Mod-Shift-ArrowUp move the selected block.
 */
export const SelectAndMoveABlock: Story = {
  render: () => <FormEditor initial={everyBlock} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const editor = await canvas.findByRole('textbox', { name: 'Form' });
    const { paragraph: para, heading, list } = blocksOf(editor);
    await userEvent.click(para);
    caretIn(para, 'end');
    press(editor, 'Escape', 27);
    // Selected (its handle shows beside it), with no frame.
    const paragraphHandle = await handleOf(editor, para);
    await expect(frameOf(editor, 'selected')).toBeNull();

    // A list: its frame takes in its markers, and its handle is in line
    // with the paragraph's.
    const item = list.querySelector('li p');
    if (item === null) throw new Error('No list item');
    const paragraphGrip = paragraphHandle.getBoundingClientRect().left;
    await userEvent.click(item);
    caretIn(item, 'end');
    press(editor, 'Escape', 27);
    await waitFor(() => {
      const frame = frameOf(editor, 'selected');
      expect(frame).not.toBeNull();
      const drawn = frame?.getBoundingClientRect();
      const text = para.getBoundingClientRect();
      // The markers stand in the 32px before the items' text; the frame is
      // 4px outside the list, which starts where the paragraph does.
      expect(drawn?.left).toBeCloseTo(text.left - 4, 0);
      expect(item.getBoundingClientRect().left - (drawn?.left ?? 0)).toBe(36);
    });
    const listGrip = (await handleOf(editor, list)).getBoundingClientRect();
    await expect(listGrip.left).toBeCloseTo(paragraphGrip, 0);

    // Back to the paragraph, to move it.
    await userEvent.click(para);
    caretIn(para, 'end');
    press(editor, 'Escape', 27);
    pointAt(heading);
    await userEvent.keyboard(withMod('{Shift>}{ArrowDown}{/Shift}'));
    await waitFor(() =>
      expect(blockTypes(documentIn(canvasElement))).toEqual([
        'heading',
        'bulletList',
        'paragraph',
        'horizontalRule',
        'fieldBlock',
        'logicBlock',
        'assetBlock',
        'paragraph',
      ]),
    );
    await userEvent.keyboard(withMod('{Shift>}{ArrowUp}{/Shift}'));
    await waitFor(() =>
      expect(blockTypes(documentIn(canvasElement)).slice(0, 3)).toEqual([
        'heading',
        'paragraph',
        'bulletList',
      ]),
    );
  },
};

/**
 * A block's settings open only from the settings button in its tab: a click
 * on the block selects it and opens nothing. From the keyboard, Escape in the
 * field's question selects the field, Tab moves to its settings button,
 * Enter opens the settings, and Escape closes them, back on the button.
 * Enter on the selected block opens them too.
 */
export const SettingsFromTheButton: Story = {
  render: () => <FormEditor initial={everyBlock} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const editor = await canvas.findByRole('textbox', { name: 'Form' });
    const label = editor.querySelector(
      '[data-field-id="f1"] [data-field-label]',
    );
    if (label === null) throw new Error('No label');
    await userEvent.click(label);
    caretIn(label, 'end');
    press(editor, 'Escape', 27);
    await waitFor(() => expect(frameOf(editor, 'selected')).not.toBeNull());
    await expect(
      page.queryByRole('dialog', { name: 'Field settings' }),
    ).toBeNull();

    // Tab: to the settings button, which has the shared focus ring.
    await userEvent.keyboard('{Tab}');
    const button = await canvas.findByRole('button', {
      name: 'Field settings',
    });
    await waitFor(() => expect(button).toHaveFocus());
    await expect(
      page.queryByRole('dialog', { name: 'Field settings' }),
    ).toBeNull();
    await userEvent.keyboard('{Enter}');
    const settings = await page.findByRole('dialog', {
      name: 'Field settings',
    });
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(settings).not.toBeInTheDocument());
    await waitFor(() => expect(button).toHaveFocus());

    // Enter on the selected block presses the button.
    await userEvent.click(label);
    caretIn(label, 'end');
    press(editor, 'Escape', 27);
    await waitFor(() => expect(frameOf(editor, 'selected')).not.toBeNull());
    await canvas.findByRole('button', { name: 'Field settings' });
    press(editor, 'Enter', 13);
    await page.findByRole('dialog', { name: 'Field settings' });
  },
};

/**
 * In right-to-left text the handle stands at the start of the line, on the
 * right, and the tab at its end, on the left.
 */
export const BlockFramesRightToLeft: Story = {
  render: () => (
    <FormEditor
      dir="rtl"
      initial={{
        type: 'doc',
        content: [
          paragraph(words('مرحبا بكم في هذه المقابلة.')),
          fieldBlock('f1', 'first_name', 'ما اسمك؟', 'اسمك الأول فقط.'),
        ],
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const editor = await canvas.findByRole('textbox', { name: 'Form' });
    const field = sectionIn(editor, '[data-field-block-view]');
    const handle = await handleOf(editor, field);
    const box = field.getBoundingClientRect();
    const grip = handle.getBoundingClientRect();
    await expect(Math.round(grip.right - box.right)).toBe(40);
    const tab = editor.querySelector('[data-block-tab]');
    if (tab === null) throw new Error('No tab');
    const drawn = tab.getBoundingClientRect();
    await expect(drawn.left - box.left).toBeLessThan(box.width / 2);
  },
};

/**
 * Arrowing off a selected block where no text follows it (here, ArrowLeft
 * from the file, after the logic block) puts an ordinary text caret on an
 * empty line there, laid out as the paragraph that typing then makes: the
 * blocks below do not move again as the first letter is typed.
 */
export const ArrowOffABlock: Story = {
  parameters: { layout: 'padded' },
  render: () => <FormEditor initial={everyBlock} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const editor = await canvas.findByRole('textbox', { name: 'Form' });
    const { file } = blocksOf(editor);
    await userEvent.click(file);
    await waitFor(() => expect(frameOf(editor, 'selected')).not.toBeNull());

    await userEvent.keyboard('{ArrowLeft}');
    const line = await waitFor(() => {
      const found = editor.querySelector('[data-gap-caret]');
      if (!(found instanceof HTMLElement)) throw new Error('No caret line');
      return found;
    });
    // No horizontal gap cursor.
    await expect(editor.querySelector('.ProseMirror-gapcursor')).toBeNull();
    const drawn = line.getBoundingClientRect();
    const caret = getComputedStyle(line, '::after');
    // A vertical caret as tall as the line, at the start of the line.
    await expect(drawn.height).toBeGreaterThan(16);
    await expect(caret.width).toBe('1px');
    await expect(Number.parseFloat(caret.height)).toBeCloseTo(drawn.height, 0);
    const fileTop = file.getBoundingClientRect().top;

    await userEvent.keyboard('Hi');
    const typed = await waitFor(() => {
      const found = Array.from(editor.querySelectorAll(':scope > p')).find(
        (each) => each.textContent === 'Hi',
      );
      if (found === undefined) throw new Error('Nothing typed');
      return found;
    });
    await expect(blockTypes(documentIn(canvasElement)).slice(5, 8)).toEqual([
      'logicBlock',
      'paragraph',
      'assetBlock',
    ]);
    await expect(editor.querySelector('[data-gap-caret]')).toBeNull();
    await expect(typed.getBoundingClientRect().top).toBeCloseTo(drawn.top, 0);
    await expect(file.getBoundingClientRect().top).toBeCloseTo(fileTop, 0);
  },
};

/**
 * Dragging a block by its handle, straight down: a copy of the block alone
 * follows the pointer, and the document shows at once where it would go, the
 * blocks around making room, while what it holds stays as it was. Letting go
 * moves it there; one Undo puts it back.
 */
export const DragShowsWhereTheBlockGoes: Story = {
  // Not centred: the editor stays where it is as the drag changes its height.
  parameters: { layout: 'padded' },
  render: () => <FormEditor initial={everyBlock} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const editor = await canvas.findByRole('textbox', { name: 'Form' });
    const host = editor.closest('[data-block-frames-host]');
    const { field, file } = blocksOf(editor);
    const before = blockTypes(documentIn(canvasElement));
    const fileTop = file.getBoundingClientRect().top;
    const handle = (await handleOf(editor, field)).getBoundingClientRect();
    const fileBox = file.getBoundingClientRect();

    // Straight down from the handle, to the lower half of the file.
    const drop = await pickUpByHandle(editor, field, {
      x: handle.left + handle.width / 2,
      y: fileBox.top + fileBox.height * 0.75,
    });

    // The copy under the pointer is the field alone: no tab, no frame, none
    // of the text around it.
    const preview = host?.querySelector('[data-block-drag-preview]');
    if (!(preview instanceof HTMLElement)) throw new Error('No preview');
    await expect(preview).toHaveTextContent('What is your first name?');
    await expect(preview.textContent).not.toContain('Thank you');
    await expect(preview.querySelector('[data-block-tab]')).toBeNull();
    await expect(host?.querySelector('[data-block-frame]')).toBeNull();
    await expect(host?.querySelector('[data-block-handle]')).toBeNull();
    // Where it would go: after the file, which moved up into its place.
    const shown = await waitFor(() => {
      const found = editor.querySelector('[data-block-drop-preview]');
      if (!(found instanceof HTMLElement)) throw new Error('Not shown');
      return found;
    });
    await expect(shown.getBoundingClientRect().top).toBeGreaterThan(
      file.getBoundingClientRect().bottom,
    );
    await expect(file.getBoundingClientRect().top).toBeLessThan(fileTop - 50);
    await expect(blockTypes(documentIn(canvasElement))).toEqual(before);

    drop();
    await waitFor(() =>
      expect(blockTypes(documentIn(canvasElement))).toEqual([
        'heading',
        'paragraph',
        'bulletList',
        'horizontalRule',
        'logicBlock',
        'assetBlock',
        'fieldBlock',
        'paragraph',
      ]),
    );
    await expect(host?.querySelector('[data-block-drag-preview]')).toBeNull();
    await expect(editor.querySelector('[data-block-drop-preview]')).toBeNull();

    await userEvent.keyboard(withMod('z'));
    await waitFor(() =>
      expect(blockTypes(documentIn(canvasElement))).toEqual(before),
    );
  },
};

/**
 * Blocks are spaced as the interview spaces the same form: a field 32px
 * above what follows it, a paragraph and a list 1em, a file 16px each side,
 * and nothing after the last block.
 */
export const SpacedAsTheInterview: Story = {
  render: () => <FormEditor initial={everyBlock} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const editor = await canvas.findByRole('textbox', { name: 'Form' });
    const below = (element: Element) => getComputedStyle(element).marginBottom;
    const block = (selector: string) => {
      const found = editor.querySelector(`:scope > ${selector}`);
      if (found === null) throw new Error(`No ${selector}`);
      return found;
    };
    await expect(below(block('.node-fieldBlock'))).toBe('32px');
    await expect(below(block('p'))).toBe('16px');
    await expect(below(block('ul'))).toBe('16px');
    await expect(below(block('.node-logicBlock'))).toBe('16px');
    await expect(below(block('.node-assetBlock'))).toBe('16px');
    await expect(getComputedStyle(block('.node-assetBlock')).marginTop).toBe(
      '16px',
    );
    // A list's items have no space between them.
    const items = editor.querySelectorAll(':scope > ul > li');
    await expect(items.length).toBe(2);
    await expect(
      Math.round(
        (items[1]?.getBoundingClientRect().top ?? 0) -
          (items[0]?.getBoundingClientRect().bottom ?? 0),
      ),
    ).toBe(0);
    await expect(below(block('p:last-child'))).toBe('0px');
    // Space taken by the field's margin is between it and the logic block.
    const field = block('.node-fieldBlock').getBoundingClientRect();
    const logic = block('.node-logicBlock').getBoundingClientRect();
    await expect(Math.round(logic.top - field.bottom)).toBe(32);
  },
};
