import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fireEvent, userEvent, within } from 'storybook/test';

import { ResizableFlexPanel } from './ResizableFlexPanel';
import Paragraph from './typography/Paragraph';
import { UnorderedList } from './typography/UnorderedList';

const meta = {
  title: 'Components/ResizableFlexPanel',
  component: ResizableFlexPanel,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div style={{ height: '500px', padding: '16px' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ResizableFlexPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

const Panel = ({ label, color }: { label: string; color: string }) => (
  <div
    className="flex h-full items-center justify-center rounded-lg text-lg font-semibold text-white"
    style={{ backgroundColor: color, minHeight: '100%' }}
  >
    {label}
  </div>
);

export const Default: Story = {
  args: {
    storageKey: 'story-default',
    defaultBasis: 30,
    min: 10,
    max: 90,
    className: 'h-full',
    children: [
      <Panel key="a" label="Panel A (30%)" color="#6366f1" />,
      <Panel key="b" label="Panel B (fills remaining)" color="#0ea5e9" />,
    ],
  },
};

export const WithBreakpoints: Story = {
  args: {
    storageKey: 'story-breakpoints',
    defaultBasis: 33,
    min: 10,
    max: 90,
    breakpoints: [{ value: 25 }, { value: 50 }, { value: 75 }],
    className: 'h-full',
    children: [
      <Panel key="a" label="Locked to 25%, 50%, 75%" color="#8b5cf6" />,
      <Panel key="b" label="Only snaps to breakpoints" color="#06b6d4" />,
    ],
  },
};

export const Vertical: Story = {
  args: {
    storageKey: 'story-vertical',
    defaultBasis: 40,
    min: 15,
    max: 85,
    orientation: 'vertical',
    className: 'h-full',
    children: [
      <Panel key="a" label="Top Panel" color="#ec4899" />,
      <Panel key="b" label="Bottom Panel" color="#f97316" />,
    ],
  },
};

export const CustomMinMax: Story = {
  args: {
    storageKey: 'story-minmax',
    defaultBasis: 50,
    min: 20,
    max: 80,
    className: 'h-full',
    children: [
      <Panel key="a" label="Min 20% / Max 80%" color="#14b8a6" />,
      <Panel key="b" label="Constrained range" color="#a855f7" />,
    ],
  },
};

const OverrideBasisDemo = () => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex h-full flex-col gap-4">
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="self-start rounded bg-white px-4 py-2 text-sm font-medium text-black"
      >
        {collapsed ? 'Expand Panel' : 'Collapse Panel'}
      </button>
      <ResizableFlexPanel
        storageKey="story-override"
        defaultBasis={30}
        min={15}
        max={60}
        overrideBasis={collapsed ? 0 : undefined}
        className="flex-1"
      >
        <Panel label="Collapsible sidebar" color="#6366f1" />
        <Panel label="Main content" color="#0ea5e9" />
      </ResizableFlexPanel>
    </div>
  );
};

export const OverrideBasis: Story = {
  render: () => <OverrideBasisDemo />,
  args: {
    storageKey: 'story-override',
    children: [
      <Panel key="a" label="A" color="#6366f1" />,
      <Panel key="b" label="B" color="#0ea5e9" />,
    ],
  },
};

export const KeyboardAccessible: Story = {
  args: {
    storageKey: 'story-keyboard',
    defaultBasis: 50,
    min: 10,
    max: 90,
    breakpoints: [{ value: 25 }, { value: 50 }, { value: 75 }],
    className: 'h-full',
    children: [
      <div
        key="a"
        className="flex h-full flex-col items-center justify-center gap-2 rounded-lg bg-[#6366f1] p-4 text-sm text-white"
      >
        <Paragraph margin="none" className="font-semibold">
          Keyboard controls:
        </Paragraph>
        <UnorderedList className="list-inside text-start text-xs">
          <li>Arrow keys: resize by step</li>
          <li>Home/End: jump to min/max</li>
          <li>PageUp/PageDown: jump between breakpoints</li>
          <li>Double-click handle: reset to default</li>
        </UnorderedList>
        <Paragraph margin="none" className="mt-2 text-xs opacity-70">
          Tab to the handle, then use these keys
        </Paragraph>
      </div>,
      <Panel key="b" label="Second panel" color="#0ea5e9" />,
    ],
  },
};

export const NameGeneratorMockup: Story = {
  args: {
    storageKey: 'story-namegen',
    defaultBasis: 30,
    min: 15,
    max: 60,
    breakpoints: [{ value: 25 }, { value: 33 }, { value: 50 }],
    className: 'h-full',
    children: [
      <div
        key="sidebar"
        className="flex h-full flex-col gap-3 rounded-lg bg-[#1e1b4b] p-4"
      >
        <div className="rounded bg-[#6366f1]/30 p-3 text-sm text-white">
          Panel 1: Existing Nodes
        </div>
        <div className="rounded bg-[#8b5cf6]/30 p-3 text-sm text-white">
          Panel 2: External Data
        </div>
      </div>,
      <div
        key="main"
        className="flex h-full flex-wrap content-start gap-3 rounded-lg bg-[#0f172a] p-4"
      >
        {Array.from({ length: 12 }, (_, i) => (
          <div
            key={i}
            className="flex size-16 items-center justify-center rounded-full bg-[#6366f1] text-xs text-white"
          >
            Node {i + 1}
          </div>
        ))}
      </div>,
    ],
  },
};

/**
 * A row runs from the right in a right-to-left language, so the resized panel
 * sits against the right edge and grows towards the left. The handle follows:
 * the left arrow widens the panel, and a drag is measured from the right.
 */
export const RightToLeft: Story = {
  globals: { appDirection: 'rtl' },
  args: {
    storageKey: 'story-right-to-left',
    defaultBasis: 50,
    min: 10,
    max: 90,
    breakpoints: [{ value: 25 }, { value: 50 }, { value: 75 }],
    className: 'h-full',
    children: [
      <Panel key="a" label="First panel" color="#6366f1" />,
      <Panel key="b" label="Second panel" color="#0ea5e9" />,
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Assert the global landed, so a story that silently lost it fails here
    // rather than passing on an LTR layout.
    await expect(document.documentElement.dir).toBe('rtl');

    const handle = canvas.getByRole('slider');
    // The split is remembered between visits; start from the default.
    await userEvent.dblClick(handle);
    await expect(handle).toHaveAttribute('aria-valuenow', '50');

    const first = canvas.getByText('First panel');
    const second = canvas.getByText('Second panel');
    await expect(first.getBoundingClientRect().left).toBeGreaterThan(
      second.getBoundingClientRect().left,
    );

    handle.focus();
    await userEvent.keyboard('{ArrowLeft}');
    await expect(handle).toHaveAttribute('aria-valuenow', '75');
    const widened = first.getBoundingClientRect().width;
    await userEvent.keyboard('{ArrowRight}');
    await expect(handle).toHaveAttribute('aria-valuenow', '50');
    await expect(first.getBoundingClientRect().width).toBeLessThan(widened);

    // A quarter of the way in from the left leaves three quarters of the row
    // to the pointer's right, which is where the first panel is.
    const row = handle.parentElement!.getBoundingClientRect();
    const pointer = { pointerId: 1, pointerType: 'mouse', button: 0 };
    await fireEvent.pointerDown(handle, { ...pointer, buttons: 1 });
    await fireEvent.pointerMove(handle, {
      ...pointer,
      buttons: 1,
      clientX: row.left + row.width * 0.25,
      clientY: row.top + row.height / 2,
    });
    await fireEvent.pointerUp(handle, pointer);
    await expect(handle).toHaveAttribute('aria-valuenow', '75');

    await userEvent.dblClick(handle);
  },
};
