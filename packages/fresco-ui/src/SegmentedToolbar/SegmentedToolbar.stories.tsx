import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Bold,
  Grid3x3,
  Italic,
  List,
  Map as MapIcon,
  Minus,
  Pencil,
  Plus,
  Redo2,
  Snowflake,
  Star,
  Trash2,
  Underline,
  Undo2,
} from 'lucide-react';
import { useState } from 'react';

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
    color: { background: 'tomato', foreground: 'white' },
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
        color: { background: 'tomato', foreground: 'white' },
        onClick: noop,
      },
      {
        type: 'button',
        id: 'review',
        label: 'Review',
        showLabel: true,
        color: { background: 'mustard', foreground: 'charcoal' },
        onClick: noop,
      },
      {
        type: 'button',
        id: 'done',
        label: 'Done',
        showLabel: true,
        color: { background: 'sea-green', foreground: 'white' },
        onClick: noop,
      },
      {
        type: 'button',
        id: 'idea',
        label: 'Idea',
        showLabel: true,
        color: { background: 'cerulean-blue', foreground: 'white' },
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
