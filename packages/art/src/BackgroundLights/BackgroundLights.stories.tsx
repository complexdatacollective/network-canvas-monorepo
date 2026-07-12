import type { Meta, StoryObj } from '@storybook/react-vite';
import type { CSSProperties } from 'react';

import BackgroundLights from './BackgroundLights';

const stage: CSSProperties = {
  position: 'relative',
  width: 720,
  height: 420,
  overflow: 'hidden',
  background: '#10131f',
};

const meta: Meta<typeof BackgroundLights> = {
  title: 'BackgroundLights/Overview',
  component: BackgroundLights,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  argTypes: {
    large: { control: { type: 'number', min: 0, max: 6, step: 1 } },
    medium: { control: { type: 'number', min: 0, max: 12, step: 1 } },
    small: { control: { type: 'number', min: 0, max: 20, step: 1 } },
    speedFactor: {
      control: { type: 'number', min: 0.1, max: 40, step: 0.1 },
    },
    colors: { control: 'object' },
    blendMode: {
      control: 'select',
      options: [
        undefined,
        'normal',
        'multiply',
        'screen',
        'overlay',
        'lighten',
        'color-dodge',
        'difference',
      ],
    },
  },
  args: {
    large: 2,
    medium: 4,
    small: 4,
    speedFactor: 1,
    blendMode: undefined,
  },
  render: (args) => (
    <div style={stage}>
      <BackgroundLights {...args} />
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
  args: { speedFactor: 10 },
};

export const Slow: Story = {
  args: { speedFactor: 0.2 },
};

const interviewerPalette = [
  '#f45d48',
  '#f6c65b',
  '#23b5d3',
  '#6c5ce7',
  '#22c55e',
  '#f72585',
] as const;

export const InterviewerMainScreen: Story = {
  parameters: { layout: 'fullscreen' },
  args: {
    large: 0,
    medium: 4,
    small: 0,
    speedFactor: 30,
    blendMode: 'color-dodge',
    colors: interviewerPalette,
  },
  render: (args) => (
    <div
      style={{
        position: 'relative',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        background:
          'linear-gradient(135deg, #111827 0%, #1d2433 45%, #161b2b 100%)',
      }}
    >
      <BackgroundLights {...args} />
    </div>
  ),
};
