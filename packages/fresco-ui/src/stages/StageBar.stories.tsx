import type { Meta, StoryObj } from '@storybook/react-vite';

import type { StageType } from '@codaco/protocol-validation';

import { StageBar } from './StageBar';

const meta = {
  title: 'Components/StageBar',
  component: StageBar,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: `
A stage sequence as a strip of equal segments, one per stage, each in its
stage type's colour from \`STAGE_TYPES\`. It reads a protocol's shape at a
glance: how long it is and where its name generators, censuses and sociograms
fall.

\`\`\`tsx
import { StageBar } from '@codaco/fresco-ui/stages/StageBar';
import { stageTypeColorStyle } from '@codaco/fresco-ui/stages/stageTypes';

<StageBar stages={protocol.stages} />
<StageBar stages={protocol.stages} label="24 stages: 1 sociogram, 1 dyad census" />

// The same colour for a dot or swatch beside a stage's name:
<span style={{ backgroundColor: stageTypeColorStyle(stage.type).color }} />
\`\`\`

Props:
- \`stages\` — the sequence in interview order; only each stage's \`type\` is read.
- \`label\` — an accessible summary. With it the bar is an \`img\` with that name; without it the bar is decoration hidden from assistive technology, on the assumption the same information is written out beside it.
- Any other \`div\` attributes, including \`className\` for width and spacing.

Each stage type's colour and icon, and the tokens behind them, are documented in **Design System / Stage Types**.
        `,
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof StageBar>;

export default meta;
type Story = StoryObj<typeof meta>;

const mixedSequence = (
  [
    'Information',
    'Information',
    'EgoForm',
    'NameGenerator',
    'NameGeneratorQuickAdd',
    'NameGeneratorRoster',
    'CategoricalBin',
    'OrdinalBin',
    'AlterForm',
    'Sociogram',
    'Sociogram',
    'DyadCensus',
    'AlterEdgeForm',
    'TieStrengthCensus',
    'Narrative',
    'Geospatial',
    'Anonymisation',
    'Information',
  ] as const satisfies readonly StageType[]
).map((type) => ({ type }));

export const Default: Story = {
  args: {
    stages: mixedSequence,
  },
};

export const WithLabel: Story = {
  args: {
    stages: mixedSequence,
    label: '18 stages: 2 sociograms, 1 dyad census, 1 tie-strength census',
  },
};

export const SingleStage: Story = {
  args: {
    stages: [{ type: 'Information' }],
  },
};

export const InNarrowContainer: Story = {
  args: { stages: mixedSequence },
  render: () => (
    <div className="max-w-40">
      <StageBar stages={mixedSequence} />
    </div>
  ),
};
