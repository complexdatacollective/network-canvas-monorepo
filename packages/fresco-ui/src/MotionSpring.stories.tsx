import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import Button from './Button';
import Heading from './typography/Heading';
import Paragraph from './typography/Paragraph';

const PRESETS = ['short', 'medium', 'long'] as const;

const PRESET_CLASSES = {
  short: 'spring-short',
  medium: 'spring-medium',
  long: 'spring-long',
} as const;

const DISCRETE_PRESET_CLASSES = {
  short: 'spring-discrete-short',
  medium: 'spring-discrete-medium',
  long: 'spring-discrete-long',
} as const;

const meta = {
  title: 'Design System/Motion Spring',
  parameters: {
    layout: 'padded',
    a11y: { disable: true },
    docs: {
      description: {
        component:
          'The `motion-spring` plugin converts Motion-style spring physics into CSS `transition` values. Three presets — `spring-short | medium | long` — cover the common cases, with `spring-discrete-*` variants that include `allow-discrete` for transitioning across discrete properties like `display`. Arbitrary `spring-[stiffness,damping]` is supported for one-off tuning.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Presets: Story = {
  render: () => {
    const [shifted, setShifted] = useState(false);
    return (
      <div className="space-y-6">
        <div>
          <Heading level="h2" margin="none" className="mb-2">
            Presets
          </Heading>
          <Paragraph margin="none" className="text-text/70 mb-6 text-sm">
            Each preset wraps `motion`&apos;s `spring(stiffness, damping)`
            helper. `short` is snappy (0.25, 0.8), `medium` is balanced (0.35,
            0.5), `long` is loose and bouncy (0.55, 0.3). Click below to toggle
            the translation.
          </Paragraph>
        </div>
        <div className="bg-background publish-colors space-y-6 rounded-lg p-8">
          <Button onClick={() => setShifted((v) => !v)}>
            {shifted ? 'Reset' : 'Animate'}
          </Button>
          <div className="space-y-4">
            {PRESETS.map((preset) => (
              <div key={preset} className="flex items-center gap-4">
                <div className="w-24 font-[monospace] text-xs">
                  spring-{preset}
                </div>
                <div className="bg-surface-1 relative h-12 flex-1 overflow-hidden rounded">
                  <div
                    className={`bg-primary absolute top-0 left-0 h-12 w-12 rounded ${PRESET_CLASSES[preset]}`}
                    style={{
                      transform: shifted
                        ? 'translateX(calc(100% * 10))'
                        : 'translateX(0)',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  },
};

export const DiscreteProperties: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    return (
      <div className="space-y-6">
        <div>
          <Heading level="h2" margin="none" className="mb-2">
            Discrete Variants
          </Heading>
          <Paragraph margin="none" className="text-text/70 mb-6 text-sm">
            `spring-discrete-*` appends `allow-discrete` so springs work across
            discrete-valued properties like `display: none ↔ block`. Combine
            with `@starting-style` to animate elements as they enter the DOM.
          </Paragraph>
        </div>
        <div className="bg-background publish-colors space-y-6 rounded-lg p-8">
          <Button onClick={() => setOpen((v) => !v)}>
            {open ? 'Hide' : 'Show'}
          </Button>
          <div className="space-y-4">
            {PRESETS.map((preset) => (
              <div key={preset} className="flex items-center gap-4">
                <div className="w-44 font-[monospace] text-xs">
                  spring-discrete-{preset}
                </div>
                <div
                  className={`bg-primary text-primary-contrast h-12 rounded px-4 leading-[3rem] ${DISCRETE_PRESET_CLASSES[preset]}`}
                  style={{
                    display: open ? 'block' : 'none',
                    opacity: open ? 1 : 0,
                  }}
                >
                  Animated entrance
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  },
};

const ARBITRARY_EXAMPLES = [
  {
    className: 'spring-[0.2,0.9]',
    label: 'spring-[0.2,0.9]',
    note: 'low stiffness, high damping — slow and controlled',
  },
  {
    className: 'spring-[0.5,0.5]',
    label: 'spring-[0.5,0.5]',
    note: 'balanced — close to the medium preset',
  },
  {
    className: 'spring-[0.8,0.2]',
    label: 'spring-[0.8,0.2]',
    note: 'high stiffness, low damping — fast and bouncy',
  },
] as const;

export const ArbitraryValues: Story = {
  render: () => {
    const [shifted, setShifted] = useState(false);
    return (
      <div className="space-y-6">
        <div>
          <Heading level="h2" margin="none" className="mb-2">
            Arbitrary Values
          </Heading>
          <Paragraph margin="none" className="text-text/70 mb-6 text-sm">
            `spring-[stiffness,damping]` accepts any static numeric pair
            (Tailwind scans class strings at build time, so values must be
            literal). Both arguments are passed through to Motion&apos;s
            `spring()` helper.
          </Paragraph>
        </div>
        <div className="bg-background publish-colors space-y-6 rounded-lg p-8">
          <Button onClick={() => setShifted((v) => !v)}>
            {shifted ? 'Reset' : 'Animate'}
          </Button>
          <div className="space-y-4">
            {ARBITRARY_EXAMPLES.map(({ className, label, note }) => (
              <div key={label} className="space-y-1">
                <div className="flex items-baseline gap-3">
                  <span className="font-[monospace] text-xs">{label}</span>
                  <span className="text-text/60 text-xs">{note}</span>
                </div>
                <div className="bg-surface-1 relative h-12 overflow-hidden rounded">
                  <div
                    className={`bg-primary absolute top-0 left-0 h-12 w-12 rounded ${className}`}
                    style={{
                      transform: shifted
                        ? 'translateX(calc(100% * 10))'
                        : 'translateX(0)',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  },
};
