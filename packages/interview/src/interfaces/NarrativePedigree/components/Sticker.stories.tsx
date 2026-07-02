import type { Meta, StoryObj } from '@storybook/react-vite';

import type { NodeShape } from '@codaco/fresco-ui/Node';

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

const ALL_SHAPES: NodeShape[] = ['circle', 'square', 'diamond'];

// A disease colour token, not hex, so the glyph reads on the interview theme.
const SAMPLE_COLOR = 'var(--node-1)';

const GRID_SIZE = 48;

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
    shape: {
      control: { type: 'select' },
      options: ALL_SHAPES,
    },
    color: { control: { type: 'color' } },
    atRiskHomozygous: { control: { type: 'boolean' } },
    size: { control: { type: 'range', min: 16, max: 96, step: 2 } },
  },
} satisfies Meta<typeof Sticker>;

export default meta;

type Story = StoryObj<typeof Sticker>;

function StickerCell({
  status,
  shape,
  atRiskHomozygous,
  caption,
}: {
  status: Status;
  shape: NodeShape;
  atRiskHomozygous?: boolean;
  caption: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        width: 96,
      }}
    >
      <Sticker
        status={status}
        shape={shape}
        color={SAMPLE_COLOR}
        size={GRID_SIZE}
        atRiskHomozygous={atRiskHomozygous}
      />
      <span className="text-muted" style={{ fontSize: 9, textAlign: 'center' }}>
        {caption}
      </span>
    </div>
  );
}

/**
 * Every status × every shape, plus the at-risk-homozygous override glyph, so the
 * Bennett-2022 notation can be checked at a glance: solid fill (affected),
 * vertical line (obligate-affected), horizontal hatch (obligate-carrier), the
 * "?"-on-break at-risk variants, the plain outline (unknown), and the solid +
 * white-"?" homozygous override. Verifies shape conformance (circle/square/
 * diamond) and white-on-dark legibility.
 */
export const ShapesAndStatuses: Story = {
  name: 'All shapes × all statuses',
  render: () => (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: 16 }}
    >
      {ALL_SHAPES.map((shape) => (
        <div
          key={shape}
          style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          <span
            className="text-muted"
            style={{ fontSize: 12, fontWeight: 600 }}
          >
            {shape}
          </span>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {ALL_STATUSES.map((status) => (
              <StickerCell
                key={status}
                status={status}
                shape={shape}
                caption={status}
              />
            ))}
            <StickerCell
              status="affected"
              shape={shape}
              atRiskHomozygous
              caption="atRiskHomozygous"
            />
          </div>
        </div>
      ))}
    </div>
  ),
};

/** Interactive args story — dial in status, shape, colour, at-risk flag, size. */
export const Interactive: Story = {
  name: 'Interactive (args)',
  args: {
    status: 'affected',
    shape: 'circle',
    color: SAMPLE_COLOR,
    atRiskHomozygous: false,
    size: STICKER_SIZE_PX * 2,
  },
};
