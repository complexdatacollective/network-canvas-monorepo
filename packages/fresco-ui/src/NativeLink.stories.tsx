import type { Meta, StoryObj } from '@storybook/react-vite';
import * as React from 'react';

import { NativeLink } from './NativeLink';

const meta = {
  title: 'Components/NativeLink',
  component: NativeLink,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'The canonical animated inline link. It renders a native anchor by default, forwards standard anchor props and refs, and composes with framework router links through the render prop.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof NativeLink>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    href: 'https://networkcanvas.com',
    children: 'Network Canvas',
  },
};

export const InlineProse: Story = {
  render: () => (
    <p className="max-w-sm text-base leading-relaxed">
      Read the{' '}
      <NativeLink href="https://documentation.networkcanvas.com">
        Network Canvas documentation and learning resources
      </NativeLink>{' '}
      to get started with your first study.
    </p>
  ),
};

const RouterLink = React.forwardRef<
  HTMLAnchorElement,
  Omit<React.ComponentPropsWithoutRef<'a'>, 'href'> & { to: string }
>(({ to, children, ...props }, ref) => (
  <a ref={ref} href={to} {...props}>
    {children}
  </a>
));

RouterLink.displayName = 'RouterLink';

export const RouterComposition: Story = {
  render: () => (
    <NativeLink render={<RouterLink to="/documentation" />}>
      Router-rendered documentation link
    </NativeLink>
  ),
};

export const Download: Story = {
  args: {
    href: '/example.netcanvas',
    download: true,
    children: 'Download example protocol',
  },
};
