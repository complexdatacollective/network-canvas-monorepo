import type { Meta, StoryObj } from '@storybook/react-vite';

import { StickerNode, STICKER_CAP } from './StickerNode';
import type { DiseaseSticker } from './StickerNode';

const meta = {
  title: 'NarrativePedigree/StickerNode',
  component: StickerNode,
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    shape: {
      control: { type: 'radio' },
      options: ['square', 'circle', 'diamond'],
    },
  },
} satisfies Meta<typeof StickerNode>;

export default meta;

type Story = StoryObj<typeof StickerNode>;

const allStatusDiseases: DiseaseSticker[] = [
  { color: '#e53e3e', status: 'affected' },
  { color: '#dd6b20', status: 'obligateAffected' },
  { color: '#d69e2e', status: 'obligateCarrier' },
  { color: '#38a169', status: 'atRiskAffected' },
  { color: '#3182ce', status: 'atRiskCarrier' },
  { color: '#805ad5', status: 'unknown' },
];

export const AllStatusesSquare: Story = {
  name: 'All statuses — square',
  args: {
    label: 'Alice',
    shape: 'square',
    diseases: allStatusDiseases,
  },
};

export const AllStatusesCircle: Story = {
  name: 'All statuses — circle',
  args: {
    label: 'Bob',
    shape: 'circle',
    diseases: allStatusDiseases,
  },
};

export const AllStatusesDiamond: Story = {
  name: 'All statuses — diamond',
  args: {
    label: 'Carol',
    shape: 'diamond',
    diseases: allStatusDiseases,
  },
};

export const SingleAffected: Story = {
  name: 'Single disease — affected',
  args: {
    label: 'David',
    shape: 'square',
    diseases: [{ color: '#e53e3e', status: 'affected' }],
  },
};

export const UnknownStatus: Story = {
  name: 'Unknown status (shows ? not absence)',
  args: {
    label: 'Eve',
    shape: 'circle',
    diseases: [{ color: '#805ad5', status: 'unknown' }],
  },
};

export const OverflowWithPlusN: Story = {
  name: `Overflow — ${STICKER_CAP + 1} diseases → +N marker`,
  args: {
    label: 'Frank',
    shape: 'square',
    diseases: [
      { color: '#e53e3e', status: 'affected' },
      { color: '#dd6b20', status: 'obligateAffected' },
      { color: '#d69e2e', status: 'obligateCarrier' },
      { color: '#38a169', status: 'atRiskAffected' },
      { color: '#3182ce', status: 'atRiskCarrier' },
      { color: '#805ad5', status: 'unknown' },
      { color: '#e53e3e', status: 'affected' },
    ],
  },
};

export const NoDiseases: Story = {
  name: 'No diseases (bare node)',
  args: {
    label: 'Grace',
    shape: 'square',
    diseases: [],
  },
};

export const ThreeDiseases: Story = {
  name: 'Three diseases — mixed statuses',
  args: {
    label: 'Henry',
    shape: 'diamond',
    diseases: [
      { color: '#e53e3e', status: 'affected' },
      { color: '#3182ce', status: 'atRiskCarrier' },
      { color: '#805ad5', status: 'unknown' },
    ],
  },
};

// Per-status stories — each status rendered across square, circle, and diamond
export const StatusAffected: Story = {
  name: 'Status: affected (solid fill) × all shapes',
  render: () => (
    <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
      {(['square', 'circle', 'diamond'] as const).map((shape) => (
        <StickerNode
          key={shape}
          label={shape}
          shape={shape}
          diseases={[{ color: '#e53e3e', status: 'affected' }]}
        />
      ))}
    </div>
  ),
};

export const StatusObligateAffected: Story = {
  name: 'Status: obligateAffected (double ring) × all shapes',
  render: () => (
    <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
      {(['square', 'circle', 'diamond'] as const).map((shape) => (
        <StickerNode
          key={shape}
          label={shape}
          shape={shape}
          diseases={[{ color: '#dd6b20', status: 'obligateAffected' }]}
        />
      ))}
    </div>
  ),
};

export const StatusObligateCarrier: Story = {
  name: 'Status: obligateCarrier (ring + dot) × all shapes',
  render: () => (
    <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
      {(['square', 'circle', 'diamond'] as const).map((shape) => (
        <StickerNode
          key={shape}
          label={shape}
          shape={shape}
          diseases={[{ color: '#d69e2e', status: 'obligateCarrier' }]}
        />
      ))}
    </div>
  ),
};

export const StatusAtRiskAffected: Story = {
  name: 'Status: atRiskAffected (half-filled) × all shapes',
  render: () => (
    <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
      {(['square', 'circle', 'diamond'] as const).map((shape) => (
        <StickerNode
          key={shape}
          label={shape}
          shape={shape}
          diseases={[{ color: '#38a169', status: 'atRiskAffected' }]}
        />
      ))}
    </div>
  ),
};

export const StatusAtRiskCarrier: Story = {
  name: 'Status: atRiskCarrier (centre dot) × all shapes',
  render: () => (
    <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
      {(['square', 'circle', 'diamond'] as const).map((shape) => (
        <StickerNode
          key={shape}
          label={shape}
          shape={shape}
          diseases={[{ color: '#3182ce', status: 'atRiskCarrier' }]}
        />
      ))}
    </div>
  ),
};

export const StatusUnknown: Story = {
  name: 'Status: unknown (? glyph) × all shapes',
  render: () => (
    <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
      {(['square', 'circle', 'diamond'] as const).map((shape) => (
        <StickerNode
          key={shape}
          label={shape}
          shape={shape}
          diseases={[{ color: '#805ad5', status: 'unknown' }]}
        />
      ))}
    </div>
  ),
};
