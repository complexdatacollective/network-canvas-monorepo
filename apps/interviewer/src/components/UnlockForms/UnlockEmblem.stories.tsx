import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Fingerprint,
  KeyRound,
  RectangleEllipsis,
  ShieldCheck,
} from 'lucide-react';

import { UnlockEmblem } from './UnlockEmblem';

// The decorative, seed-patterned emblem shown above every unlock/enrolment
// dialog. The Pattern background and the ring colour are derived from `seed`;
// `icon` is any lucide glyph. One args-driven story — change the seed to see
// the palette shift, swap the icon from the controls.
const ICONS = { KeyRound, RectangleEllipsis, Fingerprint, ShieldCheck };

type StoryArgs = { seed: string; icon: keyof typeof ICONS };

const meta: Meta<StoryArgs> = {
  title: 'Auth/UnlockEmblem',
  parameters: { layout: 'centered' },
  args: { seed: 'pin-unlock', icon: 'KeyRound' },
  argTypes: {
    seed: {
      control: 'text',
      description: 'Seeds the Pattern palette + ring colour',
    },
    icon: { control: 'select', options: Object.keys(ICONS) },
  },
  render: ({ seed, icon }) => <UnlockEmblem seed={seed} icon={ICONS[icon]} />,
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {};
