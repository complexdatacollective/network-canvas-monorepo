import type { Meta, StoryObj } from '@storybook/react-vite';

import type { StageType } from '@codaco/protocol-validation';

import Paragraph from '../typography/Paragraph';
import { StageBar } from './StageBar';
import {
  STAGE_TYPE_COLORS,
  stageTypeColorStyle,
  stageTypeIcon,
} from './stageTypes';

const meta = {
  title: 'Components/StageBar',
  component: StageBar,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: `
A stage sequence as a strip of equal segments, one per stage, each in its
interface's colour from \`STAGE_TYPE_COLORS\`. It reads a protocol's shape at a
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

\`STAGE_TYPE_COLORS\` and \`STAGE_TYPE_ICONS\` are the single maps of stage type to palette colour and to a Lucide icon, both keyed by the protocol schema's stage union so a new stage type cannot ship without either. \`isStageType\` narrows a type read from protocol JSON; \`stageTypeColorStyle\` gives a stage type's colour as CSS variables and \`stageTypeIcon\` its icon component. The icon is decoration wherever the stage is already named in text, so render it with \`aria-hidden\`.
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

export const AllStageTypes: Story = {
  args: { stages: mixedSequence },
  render: () => (
    <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
      {(Object.keys(STAGE_TYPE_COLORS) as StageType[]).map((type) => {
        const { color, contrast } = stageTypeColorStyle(type);
        const StageIcon = stageTypeIcon(type);
        return (
          <div key={type} className="flex items-center gap-3">
            <span
              aria-hidden
              className="flex size-10 shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: color, color: contrast }}
            >
              <StageIcon className="size-5" />
            </span>
            <dt className="font-monospace text-sm">{type}</dt>
            <Paragraph
              intent="caption"
              emphasis="muted"
              margin="none"
              render={<dd />}
            >
              {STAGE_TYPE_COLORS[type]}
            </Paragraph>
          </div>
        );
      })}
    </dl>
  ),
};
