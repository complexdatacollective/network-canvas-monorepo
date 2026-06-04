import type { Meta, StoryObj } from '@storybook/react-vite';
import type { CSSProperties } from 'react';

import BackgroundBlobs from './BackgroundBlobs';

const stage: CSSProperties = {
  position: 'relative',
  width: 720,
  height: 420,
  borderRadius: 12,
  overflow: 'hidden',
  background: '#0f0f1a',
};

const meta: Meta<typeof BackgroundBlobs> = {
  title: 'BackgroundBlobs/Overview',
  component: BackgroundBlobs,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  argTypes: {
    large: { control: { type: 'number', min: 0, max: 6, step: 1 } },
    medium: { control: { type: 'number', min: 0, max: 12, step: 1 } },
    small: { control: { type: 'number', min: 0, max: 20, step: 1 } },
    speedFactor: { control: { type: 'number', min: 0.1, max: 5, step: 0.1 } },
    compositeOperation: {
      control: 'select',
      options: [
        'source-over',
        'multiply',
        'screen',
        'overlay',
        'lighten',
        'color-dodge',
        'difference',
      ],
    },
    filter: { control: 'text' },
  },
  args: {
    large: 2,
    medium: 4,
    small: 4,
    speedFactor: 1,
    compositeOperation: 'source-over',
    filter: '',
  },
  render: (args) => (
    <div style={stage}>
      <BackgroundBlobs {...args} />
    </div>
  ),
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Dense: Story = {
  args: { large: 4, medium: 8, small: 12 },
};

export const Sparse: Story = {
  args: { large: 1, medium: 1, small: 2 },
};

export const Fast: Story = {
  args: { speedFactor: 3 },
};

export const Slow: Story = {
  args: { speedFactor: 0.2 },
};

export const Blurred: Story = {
  args: { filter: 'blur(40px)' },
};

export const ScreenBlend: Story = {
  args: { compositeOperation: 'screen' },
};

const sunsetPalette: ReadonlyArray<readonly [string, string]> = [
  ['#ff5f6d', '#ffc371'],
  ['#fc4a1a', '#f7b733'],
  ['#ff6e7f', '#bfe9ff'],
  ['#ff9966', '#ff5e62'],
];

export const SunsetPalette: Story = {
  args: { palette: sunsetPalette, large: 3, medium: 5, small: 5 },
};

const coolPalette: ReadonlyArray<readonly [string, string]> = [
  ['#00c9ff', '#92fe9d'],
  ['#3f2b96', '#a8c0ff'],
  ['#0f0c29', '#302b63'],
];

export const CoolPalette: Story = {
  args: { palette: coolPalette },
};

// Layered behind real content — the canonical use case in the apps.
export const BehindContent: Story = {
  parameters: { layout: 'fullscreen' },
  render: (args) => (
    <div
      style={{
        position: 'relative',
        width: '100vw',
        height: '100vh',
        background: '#15172b',
        overflow: 'hidden',
        color: '#fafafa',
      }}
    >
      <div style={{ position: 'absolute', inset: 0 }}>
        <BackgroundBlobs {...args} />
      </div>
      <div
        style={{
          position: 'relative',
          maxWidth: 520,
          margin: '14vh auto 0',
          padding: 32,
          borderRadius: 16,
          background: 'rgba(20, 20, 40, 0.55)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <h1 style={{ margin: 0, fontSize: 32, fontWeight: 700 }}>
          Foreground content
        </h1>
        <p style={{ marginTop: 12, opacity: 0.8, lineHeight: 1.5 }}>
          BackgroundBlobs is designed to be placed behind a frosted surface like
          this one. Tweak the controls to see how it composites with content.
        </p>
      </div>
    </div>
  ),
};
