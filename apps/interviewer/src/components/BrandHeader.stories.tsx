import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';

import { BrandHeader } from './BrandHeader';

// The app logo + "Interviewer" wordmark shown at the top of Home. Pure
// presentation — no props, no context reads — so it's storied directly.

const meta: Meta<typeof BrandHeader> = {
  title: 'Components/BrandHeader',
  component: BrandHeader,
  tags: ['autodocs'],
  render: () => <BrandHeader />,
  parameters: {
    docs: {
      description: {
        component:
          'The Home header brand scales down in tablet landscape to preserve vertical space, then returns to its larger presentation at laptop widths.',
      },
    },
    viewport: {
      options: {
        compact: {
          name: 'Below tablet landscape (900px)',
          styles: { width: '900px', height: '700px' },
          type: 'tablet',
        },
        tabletLandscape: {
          name: 'Tablet landscape (1112px)',
          styles: { width: '1112px', height: '834px' },
          type: 'tablet',
        },
        laptop: {
          name: 'Laptop (1440px)',
          styles: { width: '1440px', height: '900px' },
          type: 'desktop',
        },
      },
    },
  },
};

export default meta;
type Story = StoryObj;

function brandParts(canvasElement: HTMLElement) {
  const mark = canvasElement.querySelector('img');
  const heading = canvasElement.querySelector('h1');
  if (!mark || !heading) throw new Error('brand mark or heading not found');
  return { mark: getComputedStyle(mark), heading: getComputedStyle(heading) };
}

// The type scale is fluid, so the expected size is read from a probe set in
// the same token at the same viewport.
function tokenFontSize(
  canvasElement: HTMLElement,
  className: 'text-2xl' | 'text-3xl',
) {
  const probe = document.createElement('span');
  probe.className = className;
  canvasElement.append(probe);
  const size = getComputedStyle(probe).fontSize;
  probe.remove();
  return size;
}

export const Default: Story = {};

/** Below tablet landscape the wordmark is visually hidden beside a 64px mark. */
export const Compact: Story = {
  globals: { viewport: { value: 'compact', isRotated: false } },
  play: async ({ canvasElement }) => {
    const { mark, heading } = brandParts(canvasElement);
    await expect(mark.height).toBe('64px');
    await expect(heading.position).toBe('absolute');
  },
};

/** Tablet landscape shrinks the mark to 56px and shows a 24px wordmark. */
export const TabletLandscape: Story = {
  globals: { viewport: { value: 'tabletLandscape', isRotated: false } },
  play: async ({ canvasElement }) => {
    const { mark, heading } = brandParts(canvasElement);
    await expect(mark.height).toBe('56px');
    await expect(heading.position).toBe('static');
    await expect(heading.fontSize).toBe(
      tokenFontSize(canvasElement, 'text-2xl'),
    );
  },
};

/** Laptop widths return to an 80px mark and a 30px wordmark. */
export const Laptop: Story = {
  globals: { viewport: { value: 'laptop', isRotated: false } },
  play: async ({ canvasElement }) => {
    const { mark, heading } = brandParts(canvasElement);
    await expect(mark.height).toBe('80px');
    await expect(heading.position).toBe('static');
    await expect(heading.fontSize).toBe(
      tokenFontSize(canvasElement, 'text-3xl'),
    );
  },
};
