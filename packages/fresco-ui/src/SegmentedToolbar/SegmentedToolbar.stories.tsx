import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Bold,
  Download,
  Eye,
  FilePlus,
  FolderOpen,
  Grid3x3,
  Italic,
  List,
  Map as MapIcon,
  Minus,
  MousePointer2,
  Pencil,
  Plus,
  Redo2,
  Settings,
  SlidersHorizontal,
  Snowflake,
  Sparkles,
  Spline,
  Star,
  Trash2,
  Underline,
  Undo2,
} from 'lucide-react';
import { useState } from 'react';

import SplitButton from '../SplitButton';
import { SegmentedToolbar, type ToolbarSegment } from './SegmentedToolbar';

const componentDescription = `
A horizontal or vertical pill of controls sharing one roving-focus toolbar (Base
UI \`Toolbar\`), with optional dragging and animated add/remove. Compose it from
a typed \`items\` array; each entry is a discriminated \`ToolbarSegment\`.

### Composition

\`\`\`tsx
import {
  SegmentedToolbar,
  type ToolbarSegment,
} from '@codaco/fresco-ui/SegmentedToolbar';

const items: ToolbarSegment[] = [
  { type: 'button', id: 'undo', label: 'Undo', icon: <Undo2 />, onClick: undo },
  { type: 'toggle', id: 'freeze', label: 'Freeze', icon: <Snowflake />, pressed, onPressedChange },
  { type: 'separator', id: 'sep' },
  { type: 'group', id: 'view', mode: 'single', value, onValueChange, options: [/* … */] },
  // Single-select menu — radio items, the one matching \`value\` is checked.
  { type: 'menu', id: 'edge', kind: 'select', label: 'Draw edge', value, options, onSelect },
  // Actions menu — plain menu-item commands (no radio semantics).
  { type: 'menu', id: 'file', kind: 'actions', label: 'File', options, onSelect },
  // Controlled popover — own \`open\`; keeps the trigger pressed while open.
  { type: 'popover', id: 'props', label: 'Properties', open, onOpenChange, children: <Panel /> },
];

<SegmentedToolbar label="Editor toolbar" items={items} orientation="horizontal" size="md" draggable />
\`\`\`

### Props

**\`SegmentedToolbar\`** — \`label\` (required accessible name) · \`items\` ·
\`orientation\` \`'horizontal' | 'vertical'\` · \`size\` \`'sm' | 'md' | 'lg'\` ·
\`draggable\` · \`position\`/\`defaultPosition\`/\`onPositionChange\` ·
\`dragConstraints\` · \`dragHandleLabel\` · \`className\`.

Every segment shares **\`SegmentContent\`**: \`label\` (accessible name), \`icon\`,
\`showLabel\` (default: \`false\` with an icon, \`true\` without), \`variant\`,
\`className\`.

- **\`button\`** \`{ onClick?, disabled?, render? }\` — \`render\` hosts the styled
  button inside a caller element (e.g. a Popover/Menu trigger).
- **\`toggle\`** \`{ pressed? | defaultPressed?, onPressedChange?, disabled? }\`.
- **\`group\`** \`{ mode: 'single' | 'multiple', value?/defaultValue?, onValueChange?, options }\`
  — one toggle per option.
- **\`menu\`** \`{ kind?: 'select' | 'actions', options, onSelect, value?, pressed?, disabled? }\`
  — a **select** menu renders radio items (\`role="menuitemradio"\`, checked =
  \`value\`); an **actions** menu renders plain commands (\`role="menuitem"\`) for
  fire-and-forget actions. \`kind\` is inferred from whether a \`value\` selection
  contract is declared — pass it explicitly to be unambiguous.
- **\`popover\`** \`{ children, open?, defaultOpen?, onOpenChange?, dismissOnOutsidePress?, side?, pressed?, disabled? }\`
  — **controlled** (pass \`open\` + \`onOpenChange\`) or **uncontrolled** (omit
  \`open\`, optionally \`defaultOpen\`). A disabled trigger is announced and taken
  out of the tab order; a controlled, open popover that becomes disabled is
  closed so its content is never stranded. \`dismissOnOutsidePress: false\` makes
  it "sticky" — outside presses and focus-out no longer close it (see the
  _Sticky popover_ story).
- **\`separator\`** \`{}\`.
- **\`component\`** \`{ component }\` — renders a caller component with
  \`{ size, orientation }\` for composite controls (e.g. \`SplitButton\`).
`;

const meta = {
  title: 'Components/SegmentedToolbar',
  component: SegmentedToolbar,
  parameters: {
    layout: 'centered',
    docs: { description: { component: componentDescription } },
  },
  tags: ['autodocs'],
  argTypes: {
    orientation: {
      control: 'inline-radio',
      options: ['horizontal', 'vertical'],
    },
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
    draggable: { control: 'boolean' },
  },
} satisfies Meta<typeof SegmentedToolbar>;

export default meta;
type Story = StoryObj<typeof meta>;

const noop = () => {};

const sampleItems: ToolbarSegment[] = [
  {
    type: 'button',
    id: 'edit',
    label: 'Edit',
    icon: <Pencil />,
    onClick: noop,
  },
  {
    type: 'toggle',
    id: 'freeze',
    label: 'Freeze layout',
    icon: <Snowflake />,
    defaultPressed: false,
  },
  { type: 'separator', id: 'sep-1' },
  {
    type: 'group',
    id: 'view',
    mode: 'single',
    defaultValue: ['list'],
    options: [
      { value: 'list', label: 'List', icon: <List /> },
      { value: 'grid', label: 'Grid', icon: <Grid3x3 /> },
      { value: 'map', label: 'Map', icon: <MapIcon /> },
    ],
  },
  { type: 'separator', id: 'sep-2' },
  { type: 'button', id: 'undo', label: 'Undo', icon: <Undo2 />, onClick: noop },
  { type: 'button', id: 'redo', label: 'Redo', icon: <Redo2 />, onClick: noop },
  {
    type: 'button',
    id: 'delete',
    label: 'Delete',
    icon: <Trash2 />,
    variant: 'default',
    className: 'bg-tomato text-white',
    onClick: noop,
  },
];

export const Interactive: Story = {
  args: {
    label: 'Drawing tools',
    orientation: 'horizontal',
    size: 'md',
    draggable: false,
    items: sampleItems,
  },
};

export const Capture: Story = {
  args: {
    label: 'Drawing tools',
    draggable: true,
    items: [
      {
        type: 'button',
        id: 'edit',
        label: 'Edit',
        icon: <Pencil />,
        onClick: noop,
      },
      {
        type: 'toggle',
        id: 'freeze',
        label: 'Freeze',
        icon: <Snowflake />,
        defaultPressed: true,
      },
      {
        type: 'button',
        id: 'undo',
        label: 'Undo',
        icon: <Undo2 />,
        onClick: noop,
      },
    ],
  },
};

/** Segments can show an icon only (with a tooltip), an icon with text, or text alone. */
export const Labels: Story = {
  args: {
    label: 'Formatting',
    items: [
      // Icon only — the label is exposed via aria-label + a tooltip.
      {
        type: 'button',
        id: 'bold',
        label: 'Bold',
        icon: <Bold />,
        onClick: noop,
      },
      // Icon and text.
      {
        type: 'button',
        id: 'italic',
        label: 'Italic',
        icon: <Italic />,
        showLabel: true,
        onClick: noop,
      },
      {
        type: 'button',
        id: 'underline',
        label: 'Underline',
        icon: <Underline />,
        showLabel: true,
        onClick: noop,
      },
      { type: 'separator', id: 'sep' },
      // Text only — no icon.
      { type: 'button', id: 'clear', label: 'Clear formatting', onClick: noop },
    ],
  },
};

/**
 * A `menu` segment opens a dropdown of `options` and comes in two flavours:
 *
 * - **Select** (`kind: 'select'`, or inferred from a declared `value`) — a
 *   single-select menu of radio items; the one matching `value` is checked and
 *   the trigger shows `pressed` styling. The `Draw edge` menu mirrors the
 *   Network Composer edge-type picker.
 * - **Actions** (`kind: 'actions'`, or inferred when no `value` is declared) — a
 *   menu of one-shot commands rendered as plain menu items, so a screen reader
 *   announces an action rather than "radio button, not checked". The `File`
 *   menu is a typical example.
 */
export const MenuSelection: Story = {
  args: {
    label: 'Network tools',
    orientation: 'horizontal',
    items: [
      {
        type: 'group',
        id: 'tools',
        mode: 'single',
        defaultValue: ['select'],
        options: [
          { value: 'select', label: 'Select', icon: <MousePointer2 /> },
          { value: 'add', label: 'Add node', icon: <Plus /> },
        ],
      },
      // Single-select: `value` declares the selection contract, so `kind` is
      // inferred as 'select' and the checked item reflects `value`.
      {
        type: 'menu',
        id: 'edge',
        kind: 'select',
        label: 'Draw edge',
        icon: <Spline />,
        value: 'friendship',
        options: [
          { value: 'friendship', label: 'Friendship' },
          { value: 'advice', label: 'Advice' },
        ],
        onSelect: noop,
      },
      { type: 'separator', id: 'sep-1' },
      // Fire-and-forget commands: plain menu items, no persistent selection.
      {
        type: 'menu',
        id: 'file',
        kind: 'actions',
        label: 'File',
        icon: <FolderOpen />,
        options: [
          { value: 'new', label: 'New document', icon: <FilePlus /> },
          { value: 'open', label: 'Open…', icon: <FolderOpen /> },
          { value: 'download', label: 'Download', icon: <Download /> },
        ],
        onSelect: noop,
      },
      { type: 'separator', id: 'sep-2' },
      {
        type: 'toggle',
        id: 'auto',
        label: 'Automatic layout',
        icon: <Sparkles />,
        defaultPressed: false,
      },
    ],
  },
};

/**
 * A `popover` segment is a pressed-able button that anchors arbitrary content
 * beside it — here a text input. The Network Composer uses this for its
 * Add-node name field: the button stays pressed while the popover is open.
 */
export const PopoverInput: Story = {
  args: { label: 'Network tools', orientation: 'vertical', items: [] },
  render: function PopoverRender(args) {
    const [open, setOpen] = useState(false);
    const items: ToolbarSegment[] = [
      {
        type: 'toggle',
        id: 'select',
        label: 'Select',
        icon: <MousePointer2 />,
        pressed: !open,
        onPressedChange: () => setOpen(false),
      },
      {
        type: 'popover',
        id: 'add',
        label: 'Add node',
        icon: <Plus />,
        pressed: open,
        open,
        onOpenChange: setOpen,
        children: (
          <input
            aria-label="Name"
            placeholder="Type a name, then press Enter"
            className="w-64 rounded-full border-2 border-current/20 bg-transparent px-4 py-2"
          />
        ),
      },
    ];
    return <SegmentedToolbar {...args} items={items} />;
  },
};

/**
 * A controlled `popover` segment driven by external state. The consumer owns
 * `open`, so the panel can be opened programmatically (here, from a button
 * outside the toolbar) while the trigger stays `pressed`. Toggling `disabled`
 * while the popover is open closes it — its content is never stranded behind a
 * trigger that can no longer dismiss it.
 */
export const ControlledPopover: Story = {
  args: { label: 'Editor toolbar', items: [] },
  render: function ControlledPopoverRender(args) {
    const [open, setOpen] = useState(false);
    const [disabled, setDisabled] = useState(false);
    const items: ToolbarSegment[] = [
      {
        type: 'button',
        id: 'undo',
        label: 'Undo',
        icon: <Undo2 />,
        onClick: noop,
      },
      { type: 'separator', id: 'sep' },
      {
        type: 'popover',
        id: 'properties',
        label: 'Properties',
        icon: <SlidersHorizontal />,
        side: 'top',
        open,
        onOpenChange: setOpen,
        pressed: open,
        disabled,
        children: (
          <div className="w-56 p-2">Properties for the current selection.</div>
        ),
      },
    ];

    const controlClass =
      'inline-flex items-center gap-1 rounded-full border-2 border-current px-3 py-1 text-sm font-bold';

    return (
      <div className="flex flex-col items-center gap-6">
        <SegmentedToolbar {...args} items={items} />
        <div className="flex gap-2">
          <button
            type="button"
            className={controlClass}
            onClick={() => setOpen((current) => !current)}
          >
            {open ? 'Close' : 'Open'} properties
          </button>
          <button
            type="button"
            className={controlClass}
            onClick={() => setDisabled((current) => !current)}
          >
            {disabled ? 'Enable' : 'Disable'} tool
          </button>
        </div>
      </div>
    );
  },
};

/**
 * A "sticky" `popover` segment (`dismissOnOutsidePress: false`). Pressing
 * outside the popover or moving focus away does not close it — only the trigger
 * toggle, Escape, or the consumer clearing `open` does. Use this for a panel
 * that edits a live selection: clicking a different item elsewhere on the page
 * switches the selection without dismissing the panel, and the underlying press
 * is not swallowed. Click the counter button below the toolbar — the popover
 * stays open and the count still increments.
 */
export const StickyPopover: Story = {
  args: { label: 'Editor toolbar', items: [] },
  render: function StickyPopoverRender(args) {
    const [open, setOpen] = useState(true);
    const [count, setCount] = useState(0);
    const items: ToolbarSegment[] = [
      {
        type: 'popover',
        id: 'properties',
        label: 'Properties',
        icon: <SlidersHorizontal />,
        side: 'top',
        open,
        onOpenChange: setOpen,
        pressed: open,
        dismissOnOutsidePress: false,
        children: (
          <div className="w-56 p-2">
            Stays open across outside clicks. Press Escape or the trigger to
            close.
          </div>
        ),
      },
    ];

    return (
      <div className="flex flex-col items-center gap-6">
        <SegmentedToolbar {...args} items={items} />
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full border-2 border-current px-3 py-1 text-sm font-bold"
          onClick={() => setCount((current) => current + 1)}
        >
          Clicked {count} times (popover open: {String(open)})
        </button>
      </div>
    );
  },
};

/**
 * A `component` segment renders a caller-supplied component inside the toolbar
 * surface. Use it for composite controls such as `SplitButton`, where one
 * logical toolbar slot contains more than one button.
 */
export const ComponentSegment: Story = {
  args: { label: 'Stage actions', items: [] },
  render: function ComponentSegmentRender(args) {
    const [open, setOpen] = useState(false);
    const items: ToolbarSegment[] = [
      {
        type: 'button',
        id: 'undo',
        label: 'Undo',
        icon: <Undo2 />,
        onClick: noop,
      },
      { type: 'separator', id: 'sep' },
      {
        type: 'component',
        id: 'preview',
        component: ({ size }) => (
          <SplitButton
            className="bg-slate-blue text-white"
            icon={<Eye />}
            onClick={noop}
            onOpenChange={setOpen}
            open={open}
            popover={{
              content: <div className="w-48">Preview settings</div>,
              side: 'top',
            }}
            segment={{
              'aria-label': 'Preview settings',
              'className': 'bg-slate-blue text-white',
              'icon': <Settings />,
            }}
            size={size}
            variant="text"
          >
            Preview
          </SplitButton>
        ),
      },
    ];
    return <SegmentedToolbar {...args} items={items} />;
  },
};

/** Per-button colours use named theme palette colours for background and foreground. */
export const Colours: Story = {
  args: {
    label: 'Tags',
    items: [
      {
        type: 'button',
        id: 'urgent',
        label: 'Urgent',
        showLabel: true,
        variant: 'default',
        className: 'bg-tomato text-white',
        onClick: noop,
      },
      {
        type: 'button',
        id: 'review',
        label: 'Review',
        showLabel: true,
        variant: 'default',
        className: 'bg-mustard text-charcoal',
        onClick: noop,
      },
      {
        type: 'button',
        id: 'done',
        label: 'Done',
        showLabel: true,
        variant: 'default',
        className: 'bg-sea-green text-white',
        onClick: noop,
      },
      {
        type: 'button',
        id: 'idea',
        label: 'Idea',
        showLabel: true,
        variant: 'default',
        className: 'bg-cerulean-blue text-white',
        onClick: noop,
      },
    ],
  },
};

/** Adding and removing segments animates in and out; the container resizes via motion's layout. */
export const DynamicItems: Story = {
  args: {
    label: 'Stars',
    orientation: 'horizontal',
    size: 'md',
    items: [],
  },
  render: function DynamicRender(args) {
    const [count, setCount] = useState(3);
    const items: ToolbarSegment[] = Array.from(
      { length: count },
      (_, index) => ({
        type: 'button',
        id: `star-${index}`,
        label: `Star ${index + 1}`,
        icon: <Star />,
        onClick: noop,
      }),
    );

    const controlClass =
      'inline-flex items-center gap-1 rounded-full border-2 border-current px-3 py-1 text-sm font-bold';

    return (
      <div className="flex flex-col items-center gap-6">
        <SegmentedToolbar {...args} items={items} />
        <div className="flex gap-2">
          <button
            type="button"
            className={controlClass}
            onClick={() => setCount((current) => current + 1)}
          >
            <Plus className="size-4" /> Add
          </button>
          <button
            type="button"
            className={controlClass}
            onClick={() => setCount((current) => Math.max(0, current - 1))}
          >
            <Minus className="size-4" /> Remove
          </button>
        </div>
      </div>
    );
  },
};
