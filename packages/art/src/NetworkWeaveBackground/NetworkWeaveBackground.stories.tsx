import type { Meta, StoryObj } from '@storybook/react-vite';

import NetworkWeaveBackground from './NetworkWeaveBackground';

const meta = {
  title: 'Backgrounds/Network Weave',
  component: NetworkWeaveBackground,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: `A deterministic SVG background that gathers a dense network through a compact throat and opens it into a few expressive ribbons around foreground content.

Import \`NetworkWeaveBackground\` from \`@codaco/art/NetworkWeaveBackground\`. Configure the visual with \`seed\`, \`complexity\`, \`strands\`, \`focus\`, \`orientation\`, \`reverse\`, \`colors\`, \`intensity\`, \`flare\`, \`blendMode\`, and the optional motion props.`,
      },
    },
  },
  argTypes: {
    seed: { control: 'text' },
    complexity: { control: { type: 'range', min: 8, max: 64, step: 1 } },
    strands: { control: { type: 'range', min: 2, max: 6, step: 1 } },
    focus: { control: 'object' },
    orientation: {
      control: 'radio',
      options: ['horizontal', 'vertical'],
    },
    reverse: { control: 'boolean' },
    colors: { control: 'object' },
    backgroundColor: { control: 'color' },
    intensity: { control: { type: 'range', min: 0, max: 1, step: 0.05 } },
    flare: { control: { type: 'range', min: 0, max: 2, step: 0.05 } },
    blendMode: {
      control: 'select',
      options: [
        'normal',
        'multiply',
        'screen',
        'overlay',
        'soft-light',
        'color-dodge',
        'plus-lighter',
      ],
    },
    animated: { control: 'boolean' },
    speedFactor: {
      control: { type: 'range', min: 0.1, max: 4, step: 0.1 },
    },
    className: { table: { disable: true } },
    style: { table: { disable: true } },
  },
  args: {
    seed: 'simplifying-complex-data',
    complexity: 28,
    strands: 4,
    focus: { x: 0.5, y: 0.45, radius: 0.22 },
    orientation: 'horizontal',
    reverse: false,
    backgroundColor: 'oklch(0.9593 0.009 281)',
    intensity: 0.7,
    flare: 1.25,
    blendMode: 'multiply',
    animated: true,
    speedFactor: 1,
  },
  render: (args) => (
    <NetworkWeaveBackground
      {...args}
      style={{ display: 'block', width: '100vw', height: '100vh' }}
    />
  ),
} satisfies Meta<typeof NetworkWeaveBackground>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const BehindContent: Story = {
  render: (args) => (
    <div
      style={{
        position: 'relative',
        display: 'grid',
        width: '100vw',
        height: '100vh',
        placeItems: 'center',
        overflow: 'hidden',
        background: args.backgroundColor,
      }}
    >
      <NetworkWeaveBackground
        {...args}
        backgroundColor="transparent"
        style={{ position: 'absolute', inset: 0 }}
      />
      <main
        style={{
          position: 'relative',
          width: 'min(38rem, calc(100vw - 3rem))',
          padding: '2rem',
          color: 'oklch(0.3 0.09 281)',
          textAlign: 'center',
        }}
      >
        <p
          style={{
            margin: '0 0 1rem',
            color: 'oklch(0.5733 0.2584 11.57)',
            fontSize: '0.8rem',
            fontWeight: 800,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
          }}
        >
          Simplifying complex data
        </p>
        <h1
          style={{
            margin: 0,
            fontSize: 'clamp(2.8rem, 7vw, 5.8rem)',
            fontWeight: 900,
            letterSpacing: '-0.065em',
            lineHeight: 0.88,
          }}
        >
          Find the signal in the network.
        </h1>
        <p
          style={{
            maxWidth: '31rem',
            margin: '1.5rem auto 0',
            fontSize: 'clamp(1rem, 2vw, 1.25rem)',
            lineHeight: 1.5,
          }}
        >
          Scattered relationships gather into clear, legible strands while the
          story stays in focus.
        </p>
      </main>
    </div>
  ),
};

export const PortraitFlow: Story = {
  args: {
    orientation: 'vertical',
    focus: { x: 0.5, y: 0.5, radius: 0.2 },
  },
};

export const DarkCanvas: Story = {
  args: {
    seed: 'interviewer-dark',
    backgroundColor: 'oklch(0.28 0.09 281)',
    intensity: 0.9,
    blendMode: 'screen',
    complexity: 38,
    strands: 5,
  },
};
