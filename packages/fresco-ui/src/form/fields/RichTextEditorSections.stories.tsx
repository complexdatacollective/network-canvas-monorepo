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

import { Popover, PopoverContent } from '../../Popover';
import { inlineValuesFor } from '../../testing/inlineValues';
import { withMod } from '../../testing/modKey';
import { cx } from '../../utils/cva';
import RichTextEditorField, {
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
function StoryFieldView({ attributes, content }: RichTextFieldBlockViewProps) {
  const indeterminate = attributes.variable === '';
  return (
    <div
      className="flex flex-col gap-4"
      data-field-required={indeterminate ? undefined : ''}
    >
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">{content}</div>
        <span
          contentEditable={false}
          data-testid="field-attribute"
          className={cx(pillClasses, indeterminate && 'border-dashed italic')}
        >
          {indeterminate ? 'Choose an attribute' : attributes.variable}
        </span>
      </div>
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

function StoryAssetView({ attributes }: RichTextAssetBlockViewProps) {
  return (
    <div className="mx-auto flex h-40 w-96 items-center justify-center rounded-sm bg-current/10">
      <ImageIcon aria-hidden className="size-10 opacity-50" />
      <span className="sr-only">{attributes.assetId}</span>
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
        align: 'center',
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
  onActivate: () => undefined,
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

/** A section's own drag handle (not that of a section inside it). */
const handleOf = (section: Element): HTMLElement => {
  const handle = section.querySelector(':scope > [data-section-drag-handle]');
  if (!(handle instanceof HTMLElement)) throw new Error('No drag handle');
  return handle;
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

/**
 * Drags `section` by its handle, from whatever the pointer reaches at the
 * handle's middle, and drops it at the start of `target`'s text.
 */
const dragByHandle = (section: Element, target: Element) => {
  const from = handleOf(section).getBoundingClientRect();
  const grabbed = section.ownerDocument.elementFromPoint(
    from.left + from.width / 2,
    from.top + from.height / 2,
  );
  if (grabbed === null) throw new Error('Nothing under the handle');
  const to = target.getBoundingClientRect();
  const dataTransfer = new DataTransfer();
  const at = (x: number, y: number) => ({
    bubbles: true,
    cancelable: true,
    dataTransfer,
    clientX: x,
    clientY: y,
  });
  const start = at(from.left + from.width / 2, from.top + from.height / 2);
  const end = at(to.left + 2, to.top + to.height / 2);
  // A drag starts with the button going down on the handle.
  grabbed.dispatchEvent(new MouseEvent('mousedown', { ...start, button: 0 }));
  grabbed.dispatchEvent(new DragEvent('dragstart', start));
  target.dispatchEvent(new DragEvent('dragover', end));
  target.dispatchEvent(new DragEvent('drop', end));
  grabbed.dispatchEvent(new DragEvent('dragend', end));
};

/**
 * A field or logic block is moved by its handle, or with Mod-Shift-ArrowUp
 * and Mod-Shift-ArrowDown while it is selected (or while the caret is in a
 * field's question or hint): down past the text, into a logic block's
 * branch, and out again.
 */
export const DragSectionBlock: Story = {
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

    // Every handle can be reached by the pointer, the whole of it: a field's,
    // a logic block's, and that of a field inside a logic block's branch.
    const field = sectionIn(editor, '[data-field-id="f1"]');
    const block = sectionIn(editor, '[data-logic-block-view]');
    const nested = sectionIn(editor, '[data-field-id="f3"]');
    for (const [name, section] of [
      ['field', field],
      ['logic block', block],
      ['field in a branch', nested],
    ] as const) {
      await userEvent.hover(section);
      await expect(unreachedPointsOf(handleOf(section)), name).toEqual([]);
    }

    // Dragged by its handle from where the pointer reaches it: the logic
    // block to the top of the form, then the field in its branch out of it.
    const heading = () => {
      const found = editor.querySelector(':scope > h1');
      if (found === null) throw new Error('No heading');
      return found;
    };
    dragByHandle(block, heading());
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
    dragByHandle(sectionIn(editor, '[data-field-id="f3"]'), heading());
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
          aria-label="Field settings"
          className="h-64 w-96"
        >
          <p>Settings of the selected field</p>
        </PopoverContent>
      </Popover>
    </>
  );
}

/**
 * The popup opened last is drawn on top, whenever each was mounted. A
 * field's settings stay open while it is selected; the toolbar's link popover,
 * mounted with the editor (before the field's settings) and kept mounted
 * while it is closed, opens after them, and is drawn over them where the two
 * overlap.
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
      name: 'Field settings',
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
