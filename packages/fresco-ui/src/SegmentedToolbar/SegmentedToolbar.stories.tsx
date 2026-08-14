import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Bold,
  Download,
  Eye,
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
  Snowflake,
  Sparkles,
  Spline,
  Star,
  Trash2,
  Underline,
  Undo2,
} from 'lucide-react';
import { useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import SplitButton from '../SplitButton';
import { withTooltipProvider } from '../storybook-support/withTooltipProvider';
import { SegmentedToolbar, type ToolbarSegment } from './SegmentedToolbar';

const meta = {
  title: 'Components/SegmentedToolbar',
  component: SegmentedToolbar,
  decorators: [withTooltipProvider],
  parameters: { layout: 'centered' },
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
 * A `menu` segment is a button that opens a single-select menu. This mirrors the
 * Network Composer palette: an exclusive tool group, an edge tool that opens a
 * menu of edge types, and a toggle button for automatic layout.
 */
export const MenuSelection: Story = {
  args: {
    label: 'Network tools',
    orientation: 'vertical',
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
      {
        type: 'menu',
        id: 'edge',
        label: 'Draw edge',
        icon: <Spline />,
        value: 'friendship',
        options: [
          { value: 'friendship', label: 'Friendship' },
          { value: 'advice', label: 'Advice' },
        ],
        onSelect: noop,
      },
      { type: 'separator', id: 'sep' },
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

/**
 * Disabled segments dim but stay focusable, so a keyboard user can still reach
 * one and hear that it is unavailable — the APG toolbar behaviour. They keep
 * their tooltip too, which for an icon-only segment is its only visible label.
 */
export const Disabled: Story = {
  args: {
    label: 'Drawing tools',
    items: [
      {
        type: 'button',
        id: 'undo',
        label: 'Undo',
        icon: <Undo2 />,
        disabled: true,
        onClick: noop,
      },
      {
        type: 'button',
        id: 'redo',
        label: 'Redo',
        icon: <Redo2 />,
        onClick: noop,
      },
      { type: 'separator', id: 'sep-1' },
      {
        type: 'toggle',
        id: 'freeze',
        label: 'Freeze layout',
        icon: <Snowflake />,
        disabled: true,
        defaultPressed: false,
      },
      {
        type: 'menu',
        id: 'edge',
        label: 'Draw edge',
        icon: <Spline />,
        disabled: true,
        options: [{ value: 'friendship', label: 'Friendship' }],
        onSelect: noop,
      },
      { type: 'separator', id: 'sep-2' },
      // A segment that paints its own colours keeps them, dimmed.
      {
        type: 'button',
        id: 'download',
        label: 'Downloading…',
        icon: <Download />,
        showLabel: true,
        variant: 'default',
        className: 'bg-sea-green text-white',
        disabled: true,
        onClick: noop,
      },
    ],
  },
};

/**
 * Disabling the segment you are standing on must not move focus. Exhausting an
 * action this way — pressing Undo until there is nothing left to undo — is the
 * ordinary case, and losing focus to `<body>` would drop a keyboard or screen
 * reader user at the start of the document.
 *
 * This has to run in a real browser: the failure mode was a native `disabled`
 * attribute applied for a single commit, and only a browser blurs on it.
 */
export const KeepsFocusWhenDisabled: Story = {
  args: { label: 'Drawing tools', items: [] },
  render: function KeepsFocusRender(args) {
    const [steps, setSteps] = useState(2);
    const items: ToolbarSegment[] = [
      {
        type: 'button',
        id: 'undo',
        label: 'Undo',
        icon: <Undo2 />,
        disabled: steps === 0,
        onClick: () => setSteps((remaining) => Math.max(0, remaining - 1)),
      },
      {
        type: 'button',
        id: 'redo',
        label: 'Redo',
        icon: <Redo2 />,
        onClick: noop,
      },
    ];
    return <SegmentedToolbar {...args} items={items} />;
  },
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);
    const undo = await canvas.findByRole('button', { name: 'Undo' });

    await step('activating an enabled segment keeps focus', async () => {
      undo.focus();
      await userEvent.keyboard('{Enter}');
      expect(undo).toHaveFocus();
      expect(undo).not.toHaveAttribute('aria-disabled', 'true');
    });

    await step('exhausting it disables it without taking focus', async () => {
      await userEvent.keyboard('{Enter}');
      await waitFor(() =>
        expect(undo).toHaveAttribute('aria-disabled', 'true'),
      );
      // The regression: `document.activeElement` became <body> here.
      expect(undo).toHaveFocus();
      // Focusable-when-disabled, so it stays in the roving tab order rather
      // than being skipped over by the browser.
      expect(undo).not.toBeDisabled();
      expect(undo).toHaveAttribute('tabindex', '0');
    });

    await step('and it is inert, without becoming invisible', async () => {
      await userEvent.keyboard('{Enter}');
      expect(undo).toHaveAttribute('aria-disabled', 'true');
      expect(undo).toHaveFocus();
      expect(getComputedStyle(undo).opacity).toBe('0.5');
    });
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
