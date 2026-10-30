import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';

import type { StageType } from '@codaco/protocol-validation';

import { ThemedRegion } from '../ThemedRegion';
import Heading from '../typography/Heading';
import Paragraph from '../typography/Paragraph';
import { cx } from '../utils/cva';
import { StageBar } from './StageBar';
import { StageTypeBadge } from './StageTypeBadge';
import { STAGE_TYPES } from './stageTypes';

const meta = {
  title: 'Design System/Stage Types',
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: `
Every interview stage type has a background colour, a foreground colour and an
icon, the same in every app and every theme. Colour says which part of the
interview a stage belongs to; the icon says which interface it is.

The colours are theme tokens in \`@codaco/tailwind-config/interfaces.css\`
(loaded by \`fresco.css\`; an app with its own theme imports \`colors.css\` and
\`interfaces.css\`). Each stage type has \`--interface-<token>\` and
\`--interface-<token>-contrast\`, aliased for Tailwind as
\`--color-interface-<token>\` and \`--color-interface-<token>-contrast\`.

\`StageTypeBadge\` draws a stage type's icon on a disc of its colour, in four
sizes. \`ringed\` adds a white ring, for dark pages and for stops on a
timeline. For other uses, \`stageTypeColorStyle\` and \`stageTypeIcon\` return
the colours and the icon. \`stageColorStyle\` and \`stageIcon\` take any stage's
\`type\` as read from a protocol, and give one this build does not know a
neutral grey and a generic icon, as the badge does.

\`\`\`tsx
import { StageTypeBadge } from '@codaco/fresco-ui/stages/StageTypeBadge';
import {
  STAGE_TYPES,
  isStageType,
  stageTypeColorStyle,
  stageTypeIcon,
} from '@codaco/fresco-ui/stages/stageTypes';

<StageTypeBadge type={stage.type} size="xl" ringed />
\`\`\`

\`STAGE_TYPES\` maps each stage type to its token and icon, keyed by the
protocol schema's stage union so a new stage type cannot ship without both.
\`isStageType\` narrows a type read from protocol JSON. The icon is decoration
wherever the stage is already named in text, so render it with \`aria-hidden\`.

Each group takes one base hue from the brand palette. Its first stage type is
the brightest colour a white icon allows; each one after it is a step darker
and turns a few degrees round the hue. Every background reaches 4.5:1 with its
icon and 3:1 against Architect's platinum page. The darker members fall below
3:1 on dark pages, so draw a light ring around a stage colour there.
        `,
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

type StageTypeGroup = {
  name: string;
  base: string;
  description: string;
  types: StageType[];
};

const GROUPS: StageTypeGroup[] = [
  {
    name: 'Naming',
    base: 'neon coral',
    description: 'Build the list of people, or the whole network at once.',
    types: [
      'NameGenerator',
      'NameGeneratorQuickAdd',
      'NameGeneratorRoster',
      'NetworkComposer',
      'FamilyPedigree',
    ],
  },
  {
    name: 'Describing',
    base: 'cerulean blue',
    description:
      'Ask questions about the participant, each person or each tie.',
    types: ['EgoForm', 'AlterForm', 'AlterEdgeForm'],
  },
  {
    name: 'Grouping',
    base: 'neon carrot − 7°',
    description: 'Sort people into categories or onto a scale.',
    types: ['CategoricalBin', 'OrdinalBin'],
  },
  {
    name: 'Mapping',
    base: 'sea serpent − 25°',
    description: 'Place people or things on a map.',
    types: ['Geospatial'],
  },
  {
    name: 'Connecting',
    base: 'purple pizazz',
    description: 'Find the ties between people.',
    types: [
      'Sociogram',
      'DyadCensus',
      'OneToManyDyadCensus',
      'TieStrengthCensus',
    ],
  },
  {
    name: 'Reflecting',
    base: 'sea green',
    description: 'Look back over the network or pedigree together.',
    types: ['Narrative', 'NarrativePedigree'],
  },
  {
    name: 'Screens',
    base: 'cyber grape',
    description:
      'Show information, set the interview up or end it. They collect no network data.',
    types: ['Information', 'LanguageChooser', 'Anonymisation', 'FinishSession'],
  },
];

const ALL_TYPES = Object.keys(STAGE_TYPES) as StageType[];

export const AllStageTypes: Story = {
  render: () => (
    <div className="space-y-8">
      {GROUPS.map((group) => (
        <section key={group.name}>
          <Heading level="h3" margin="none">
            {group.name}
          </Heading>
          <Paragraph margin="none" className="text-text/70 mb-3 text-sm">
            {group.description} Based on {group.base}.
          </Paragraph>
          <ul className="tablet-portrait:grid-cols-2 grid gap-x-8 gap-y-3">
            {group.types.map((type) => (
              <li key={type} className="flex items-center gap-3">
                <StageTypeBadge type={type} data-testid={`badge-${type}`} />
                <span className="flex min-w-0 flex-col">
                  <span className="font-monospace text-sm">{type}</span>
                  <span className="font-monospace text-text/70 text-xs break-all">
                    --interface-{STAGE_TYPES[type].token}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Each stage type appears in exactly one group.
    const grouped = GROUPS.flatMap((group) => group.types);
    await expect(grouped.toSorted()).toEqual(ALL_TYPES.toSorted());

    // A badge with no token behind it paints transparent, and two stage
    // types sharing a token paint the same colour.
    const fills = ALL_TYPES.map(
      (type) =>
        getComputedStyle(canvas.getByTestId(`badge-${type}`)).backgroundColor,
    );
    for (const fill of fills) {
      await expect(fill).not.toBe('rgba(0, 0, 0, 0)');
    }
    await expect(new Set(fills).size).toBe(ALL_TYPES.length);
  },
};

const SURFACES = [
  { name: 'Platinum', note: 'Architect', className: 'bg-platinum text-text' },
  { name: 'White', note: 'networkcanvas.com', className: 'bg-white text-text' },
] as const;

function BadgeRow({ ringed }: { ringed?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {ALL_TYPES.map((type) => (
        <StageTypeBadge key={type} type={type} ringed={ringed} />
      ))}
    </div>
  );
}

/**
 * The tokens hold the same values on every page. On the two dark pages the
 * darker members of each group fall below 3:1, so each badge there carries a
 * light ring, as Architect's timeline stations do.
 */
export const OnEverySurface: Story = {
  render: () => (
    <div className="grid gap-4">
      {SURFACES.map((surface) => (
        <div
          key={surface.name}
          className={cx('rounded-lg p-4', surface.className)}
        >
          <Paragraph margin="none" className="mb-3 text-sm font-semibold">
            {surface.name} · {surface.note}
          </Paragraph>
          <BadgeRow />
        </div>
      ))}
      <div data-theme="dark" className="bg-background text-text rounded-lg p-4">
        <Paragraph margin="none" className="mb-3 text-sm font-semibold">
          Dark · Fresco dark theme
        </Paragraph>
        <BadgeRow ringed />
      </div>
      <ThemedRegion
        theme="interview"
        className="bg-background text-text rounded-lg p-4"
      >
        <Paragraph margin="none" className="mb-3 text-sm font-semibold">
          Navy · interview
        </Paragraph>
        <BadgeRow ringed />
      </ThemedRegion>
    </div>
  ),
};

const SAMPLE_SEQUENCE = (
  [
    'Information',
    'LanguageChooser',
    'EgoForm',
    'NameGenerator',
    'NameGeneratorQuickAdd',
    'AlterForm',
    'CategoricalBin',
    'Sociogram',
    'DyadCensus',
    'TieStrengthCensus',
    'AlterEdgeForm',
    'Narrative',
    'Anonymisation',
    'FinishSession',
  ] as const satisfies readonly StageType[]
).map((type) => ({ type }));

/**
 * A protocol's stages as the protocol gallery lists them: the stage bar
 * above, then each stage with its icon badge.
 */
export const InAStageSequence: Story = {
  render: () => (
    <div className="max-w-md">
      <StageBar stages={SAMPLE_SEQUENCE} />
      <ol className="mt-4 space-y-2">
        {SAMPLE_SEQUENCE.map((stage, index) => (
          <li
            key={`${index}-${stage.type}`}
            className="flex items-center gap-3 text-sm"
          >
            <span className="font-monospace text-text/50 w-[2ch]">
              {String(index + 1).padStart(2, '0')}
            </span>
            <StageTypeBadge type={stage.type} size="sm" />
            <span>{stage.type}</span>
          </li>
        ))}
      </ol>
    </div>
  ),
};

const BADGE_SIZES = ['sm', 'md', 'lg', 'xl'] as const;

/**
 * `StageTypeBadge` at each size, plain and ringed. The ringed extra-large badge
 * is the stop on Architect's timelines; the ringed large one is the stop in
 * the interview's stage menu, on the navy interview theme. A stage type this
 * build does not know is drawn in a neutral grey.
 */
export const BadgeSizes: Story = {
  render: () => (
    <div className="grid gap-4">
      <div className="bg-platinum text-text flex flex-wrap items-center gap-6 rounded-lg p-6">
        {BADGE_SIZES.map((size) => (
          <StageTypeBadge key={size} type="Sociogram" size={size} />
        ))}
        {BADGE_SIZES.map((size) => (
          <StageTypeBadge key={size} type="Sociogram" size={size} ringed />
        ))}
        <StageTypeBadge type="FutureInterface" size="xl" ringed />
      </div>
      <ThemedRegion
        theme="interview"
        className="bg-background text-text flex flex-wrap items-center gap-6 rounded-lg p-6"
      >
        {BADGE_SIZES.map((size) => (
          <StageTypeBadge key={size} type="NameGenerator" size={size} ringed />
        ))}
      </ThemedRegion>
    </div>
  ),
};
