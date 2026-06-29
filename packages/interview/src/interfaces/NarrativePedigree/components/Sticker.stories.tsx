import type { Meta, StoryObj } from '@storybook/react-vite';

import type { Status } from '../genetics/status';
import { Sticker, STICKER_SIZE_PX } from './Sticker';

const ALL_STATUSES: Status[] = [
  'affected',
  'obligateAffected',
  'obligateCarrier',
  'atRiskAffected',
  'atRiskCarrier',
  'unknown',
];

const SAMPLE_COLOR = '#e53e3e';

const meta = {
  title: 'NarrativePedigree/Sticker',
  component: Sticker,
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    status: {
      control: { type: 'select' },
      options: ALL_STATUSES,
    },
    color: { control: { type: 'color' } },
    atRiskHomozygous: { control: { type: 'boolean' } },
    sizePx: { control: { type: 'range', min: 16, max: 64, step: 2 } },
  },
} satisfies Meta<typeof Sticker>;

export default meta;

type Story = StoryObj<typeof Sticker>;

/** All six genetic statuses for a single disease colour. */
export const AllStatuses: Story = {
  name: 'All statuses — sample colour',
  render: () => (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', padding: 16 }}>
      {ALL_STATUSES.map((status) => (
        <div
          key={status}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Sticker status={status} color={SAMPLE_COLOR} />
          <span className="text-muted" style={{ fontSize: 10 }}>
            {status}
          </span>
        </div>
      ))}
    </div>
  ),
};

/** Interactive args story — dial in status, colour, at-risk flag, and size. */
export const Interactive: Story = {
  name: 'Interactive (args)',
  args: {
    status: 'affected',
    color: SAMPLE_COLOR,
    atRiskHomozygous: false,
    sizePx: STICKER_SIZE_PX,
  },
};

/** At-risk-homozygous triangle on every status. */
export const AtRiskHomozygousAll: Story = {
  name: 'At-risk-homozygous triangle — all statuses',
  render: () => (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', padding: 16 }}>
      {ALL_STATUSES.map((status) => (
        <div
          key={status}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Sticker status={status} color={SAMPLE_COLOR} atRiskHomozygous />
          <span className="text-muted" style={{ fontSize: 10 }}>
            {status}
          </span>
        </div>
      ))}
    </div>
  ),
};
