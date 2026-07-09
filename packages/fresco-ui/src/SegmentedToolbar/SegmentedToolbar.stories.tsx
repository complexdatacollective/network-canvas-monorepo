import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Bold,
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

import SplitButton from '../SplitButton';
import { SegmentedToolbar, type ToolbarSegment } from './SegmentedToolbar';

const meta = {
  title: 'Components/SegmentedToolbar',
  component: SegmentedToolbar,
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
        className: 'bg-tomato text-white',
        onClick: noop,
      },
      {
        type: 'button',
        id: 'review',
        label: 'Review',
        showLabel: true,
        className: 'bg-mustard text-charcoal',
        onClick: noop,
      },
      {
        type: 'button',
        id: 'done',
        label: 'Done',
        showLabel: true,
        className: 'bg-sea-green text-white',
        onClick: noop,
      },
      {
        type: 'button',
        id: 'idea',
        label: 'Idea',
        showLabel: true,
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
