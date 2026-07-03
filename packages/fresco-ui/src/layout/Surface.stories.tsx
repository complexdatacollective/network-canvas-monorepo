import type { Meta, StoryFn } from '@storybook/react-vite';
import type { ElementType } from 'react';

import { Button } from '../Button';
import Surface, { MotionSurface, type SurfaceVariants } from './Surface';

// Define the metadata for the Storybook
const meta: Meta<typeof Surface> = {
  title: 'Components/Surface',
  component: Surface,
  argTypes: {
    floating: {
      control: 'boolean',
      description:
        'Applies the popover surface treatment regardless of depth and restarts the depth ladder for children.',
      defaultValue: false,
    },
    spacing: {
      control: {
        type: 'select',
        options: ['none', 'xs', 'sm', 'md', 'lg', 'xl'],
      },
      description: 'Defines the padding inside the Surface.',
      defaultValue: 'md',
    },
    shadow: {
      control: {
        type: 'select',
        options: ['none', 'xs', 'sm', 'md', 'lg', 'xl'],
      },
      description: 'Defines the shadow tier (independent of padding).',
      defaultValue: 'md',
    },
    as: {
      control: {
        type: 'select',
        options: ['div', 'section', 'article', 'main', 'header', 'footer'],
      },
      description: 'HTML element to render as.',
      defaultValue: 'div',
    },
    className: {
      control: 'text',
      description: 'Additional CSS classes.',
    },
    id: {
      control: 'text',
      description: 'HTML id attribute.',
    },
    role: {
      control: 'text',
      description: 'ARIA role attribute.',
    },
    children: {
      control: 'text',
      description: 'Content inside the Surface.',
    },
  },
  tags: ['autodocs'],
} as Meta<typeof Surface>;

export default meta;

// Levels are derived from nesting: each Surface renders one step above the
// Surface it is mounted inside, clamping at the deepest token.
export const DerivedLevels: StoryFn<typeof Surface> = () => (
  <div className="bg-background text-text @container p-10">
    Background
    <Surface className="mt-4 flex flex-col space-y-4">
      Depth 0 (derived)
      <Button color="default">Default Button</Button>
      <Surface className="mt-4 flex flex-col space-y-4">
        Depth 1 (derived)
        <Button color="default">Default Button</Button>
        <Surface className="mt-4 flex flex-col space-y-4">
          Depth 2 (derived)
          <Button color="default">Default Button</Button>
          <Surface className="mt-4 flex flex-col space-y-4">
            Depth 3 (derived)
            <Button color="default">Default Button</Button>
          </Surface>
        </Surface>
      </Surface>
    </Surface>
  </div>
);

// Intermediate non-Surface elements do not affect the derived depth.
export const DerivationThroughWrappers: StoryFn<typeof Surface> = () => (
  <Surface spacing="lg">
    Depth 0
    <div className="mt-4 grid grid-cols-2 gap-4">
      <Surface>Depth 1</Surface>
      <Surface>Depth 1</Surface>
    </div>
  </Surface>
);

// A floating Surface applies the popover treatment at any depth and restarts
// the ladder: Surfaces inside it derive from the overlay base.
export const FloatingResetsDepth: StoryFn<typeof Surface> = () => (
  <Surface>
    Depth 0
    <Surface className="mt-4">
      Depth 1
      <Surface className="mt-4">
        Depth 2
        <Surface floating className="mt-4">
          Floating (popover treatment)
          <Surface className="mt-4">
            Depth 1 — derived from the floating base
          </Surface>
        </Surface>
      </Surface>
    </Surface>
  </Surface>
);

// Surface with Different Spacing
export const DifferentSpacing: StoryFn<typeof Surface> = () => (
  <div className="space-y-4">
    {['none', 'xs', 'sm', 'md', 'lg', 'xl'].map((spacing) => (
      <Surface key={spacing} spacing={spacing as SurfaceVariants['spacing']}>
        Surface with {spacing} spacing
      </Surface>
    ))}
  </div>
);

// Surface with Different Elevation (independent of padding)
export const DifferentElevation: StoryFn<typeof Surface> = () => (
  <div className="space-y-4">
    {(['none', 'xs', 'sm', 'md', 'lg', 'xl'] as const).map((shadow) => (
      <Surface
        key={shadow}
        spacing="sm"
        shadow={shadow as SurfaceVariants['shadow']}
      >
        Surface with {shadow} shadow
      </Surface>
    ))}
  </div>
);

// Surface as Different HTML Elements
export const AsDifferentElements: StoryFn<typeof Surface> = () => (
  <div className="space-y-4">
    {['div', 'section', 'article', 'main', 'header', 'footer'].map(
      (element) => (
        <Surface key={element} as={element as ElementType} spacing="md">
          Surface as &lt;{element}&gt; element
        </Surface>
      ),
    )}
  </div>
);

// Surface with Additional Class Names
export const WithAdditionalClassName: StoryFn<typeof Surface> = () => (
  <Surface spacing="md" className="border-destructive border-2">
    Surface with additional border classes
  </Surface>
);

// MotionSurface Story with Animation
export const MotionSurfaceExample: StoryFn<typeof Surface> = () => (
  <MotionSurface
    spacing="lg"
    initial={{ opacity: 0, y: -50 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5 }}
  >
    Animated MotionSurface Component
  </MotionSurface>
);
