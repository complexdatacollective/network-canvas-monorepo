import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ComponentProps } from 'react';

import type { Status } from '../genetics/status';
import { StickerNode } from './StickerNode';
import type { DiseaseSticker } from './StickerNode';

/**
 * Story args: the real StickerNode props plus a synthetic `diseaseCount` control
 * from which the `diseases` array is generated in `render`.
 */
type StoryArgs = ComponentProps<typeof StickerNode> & { diseaseCount: number };

const ALL_STATUSES: Status[] = [
  'affected',
  'obligateAffected',
  'obligateCarrier',
  'atRiskAffected',
  'atRiskCarrier',
  'unknown',
];

/** CSS custom property tokens for disease colours — no hardcoded hex. */
const DISEASE_COLOR_TOKENS = [
  'var(--node-1)',
  'var(--node-2)',
  'var(--node-3)',
  'var(--node-4)',
  'var(--node-5)',
  'var(--node-6)',
  'var(--node-7)',
  'var(--node-8)',
] as const;

/**
 * Builds a DiseaseSticker array of `count` entries, cycling through the six
 * Status values and the eight node colour tokens. The second entry is always
 * atRiskHomozygous so that marker is visible from count ≥ 2.
 */
function buildDiseases(count: number): DiseaseSticker[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `disease-${i}`,
    color: DISEASE_COLOR_TOKENS[i % DISEASE_COLOR_TOKENS.length],
    status: ALL_STATUSES[i % ALL_STATUSES.length],
    atRiskHomozygous: i === 1,
  }));
}

const meta = {
  title: 'NarrativePedigree/StickerNode',
  component: StickerNode,
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    shape: {
      control: { type: 'select' },
      options: ['circle', 'square', 'diamond'],
    },
    diseaseCount: {
      control: { type: 'range', min: 1, max: 8, step: 1 },
    },
    selected: {
      control: { type: 'boolean' },
    },
    label: {
      control: { type: 'text' },
    },
    // diseases is derived from diseaseCount — exclude from the controls panel
    diseases: { table: { disable: true } },
    color: { table: { disable: true } },
    highlighted: { table: { disable: true } },
    onSelectDisease: { table: { disable: true } },
  },
} satisfies Meta<StoryArgs>;

export default meta;

type Story = StoryObj<StoryArgs>;

/**
 * Playground story — adjust shape, diseaseCount, selected, and label to verify
 * sticker overlap (50%) and anchor ordering per shape:
 *   circle   → even angular distribution
 *   square   → corners first, then edge midpoints
 *   diamond  → midpoints first, then corners
 * Try counts 1, 4, 6, 8 to see distribution fill up.
 */
export const Playground: Story = {
  name: 'Playground',
  args: {
    label: 'Alice',
    shape: 'square',
    diseaseCount: 4,
    selected: false,
  },
  render: ({ label, shape, selected, diseaseCount }) => (
    <StickerNode
      label={label}
      shape={shape}
      selected={selected}
      diseases={buildDiseases(diseaseCount)}
    />
  ),
};
