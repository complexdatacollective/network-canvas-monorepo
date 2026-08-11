import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { expect, waitFor, within } from 'storybook/test';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import type { ProtocolWithCounts } from '~/lib/db/types';
import { SAMPLE_PROTOCOL } from '~/lib/protocol/sampleProtocol';

import {
  DeckCard,
  DeckCardFooter,
  DeckCardFooterButton,
  DeckCardProgressFooter,
} from './DeckCard';

// DeckCard is "the protocol card" — the card the user sees for each imported
// protocol in the deck. The deck renders cards at a 1/1 aspect ratio
// (ProtocolDeck's CARD_ASPECT), so these stories default to square frames
// sized by a single `size` control. The card's internal layout (heading
// size, meta row, description line-clamp, Start/Delete button row) is
// driven by `@container` queries against the card's OWN width; the frame
// stays hand-resizable (drag the bottom-right corner) for exploring
// non-square edge cases and every container breakpoint.

// A minimal but type-correct protocol. DeckCard only reads `name`, `hash`,
// `description`, and `importedAt`, but `ProtocolWithCounts` requires the full
// shape — so we build a valid (empty) v8 protocol to satisfy the types without
// any `as` casts.
type ProtocolOverrides = {
  name?: string;
  description?: string;
  hash?: string;
  importedAt?: string;
};

function makeProtocol({
  name = 'Social Support Networks',
  description = 'A study exploring the structure of personal support networks among recent migrants.',
  hash = 'story-protocol-hash',
  importedAt = '2026-05-20T10:00:00.000Z',
}: ProtocolOverrides = {}): ProtocolWithCounts {
  const protocol: CurrentProtocol = {
    name,
    description,
    schemaVersion: 8,
    codebook: {},
    stages: [],
  };

  return {
    id: 'story-protocol',
    hash,
    name,
    schemaVersion: 8,
    importedAt,
    description,
    codebook: {},
    protocol,
    sessionCount: 0,
  };
}

// Resizable frame so the card's container queries can be exercised by dragging
// the native bottom-right resize handle. The card is `h-full w-full`, so the
// frame's content box is exactly the card's container width. Initial size is
// square to match the deck's 1/1 card aspect.
function ResizableFrame({
  size = 480,
  children,
}: {
  size?: number;
  children: ReactNode;
}) {
  return (
    <div
      className="ring-outline/40 resize overflow-hidden ring-2"
      style={{ width: size, height: size, minWidth: 140, minHeight: 140 }}
    >
      {children}
    </div>
  );
}

type StoryArgs = {
  name: string;
  description: string;
  importedAt: string;
  isActive: boolean;
  sessionCount: number;
  requiresInternetConnection: boolean;
  // Toggle the delete control to watch the requires-internet pill glide to
  // its new position in the top row.
  showDelete: boolean;
  // Square frame edge — the deck renders cards at a 1/1 aspect ratio.
  size: number;
  // Loading-state stories only: import progress fraction + status message.
  progress?: number;
  progressMessage?: string;
};

const meta: Meta<StoryArgs> = {
  title: 'Components/ProtocolCard',
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'The protocol card (`DeckCard`) shown for each imported protocol in ' +
          'the deck. Layout is driven entirely by `@container` queries against ' +
          'the card width — resize the frame to see the responsive tiers.',
      },
    },
  },
  args: {
    name: 'Social Support Networks',
    description:
      'A study exploring the structure of personal support networks among recent migrants.',
    importedAt: '2026-05-20T10:00:00.000Z',
    isActive: true,
    sessionCount: 3,
    requiresInternetConnection: false,
    showDelete: true,
    size: 480,
  },
  argTypes: {
    name: { control: 'text', description: 'Protocol name (heading + seed)' },
    description: { control: 'text', description: 'Protocol description' },
    importedAt: {
      control: 'text',
      description: 'ISO import timestamp (rendered via TimeAgo)',
    },
    isActive: {
      control: 'boolean',
      description: 'Active cards show the accent ring + Start/Delete row',
    },
    sessionCount: { control: { type: 'number', min: 0 } },
    requiresInternetConnection: {
      control: 'boolean',
      description:
        'Derived in ProtocolDeck from the protocol stages (true when a ' +
        'Geospatial stage is present); toggles the offline/online pill.',
    },
    showDelete: {
      control: 'boolean',
      description:
        'Toggling exercises the top-row choreography: the requires-internet ' +
        'pill glides to its new position as the delete control comes and goes',
    },
    size: { control: { type: 'range', min: 140, max: 720, step: 4 } },
  },
  render: ({
    name,
    description,
    importedAt,
    isActive,
    sessionCount,
    requiresInternetConnection,
    showDelete,
    size,
  }) => (
    <ResizableFrame size={size}>
      <DeckCard
        protocol={makeProtocol({ name, description, importedAt })}
        isActive={isActive}
        sessionCount={sessionCount}
        requiresInternetConnection={requiresInternetConnection}
        onActivate={() => {}}
        onDelete={showDelete ? () => {} : undefined}
        footer={
          isActive ? (
            <DeckCardFooter key="start-interview">
              <DeckCardFooterButton onClick={() => {}}>
                Start new interview
              </DeckCardFooterButton>
            </DeckCardFooter>
          ) : undefined
        }
      />
    </ResizableFrame>
  ),
};

export default meta;
type Story = StoryObj<StoryArgs>;

/**
 * Drag the bottom-right corner of the framed card to resize it and watch the
 * `@container` breakpoints respond — heading scale, meta row visibility,
 * description line-clamp, and the Start/Delete button row layout all adapt.
 */
export const Playground: Story = {};

export const Active: Story = {
  args: { isActive: true },
};

export const Inactive: Story = {
  args: { isActive: false },
};

export const ShortDescription: Story = {
  args: {
    name: 'Friendship Ties',
    description: 'A quick two-prompt name generator.',
  },
};

export const LongDescription: Story = {
  args: {
    name: 'Community Health & Resource Access',
    description:
      'A comprehensive multi-stage protocol covering household composition, ' +
      'social support, health-service access, and community resource mapping. ' +
      'The description intentionally runs long to exercise the dynamic ' +
      'line-clamp that fits the text to whatever vertical space the card has.',
  },
};

// The heading's rendered box must hold every line of the name (no clamp
// mid-name, no glyphs clipped by the row). Compared in whole lines because
// scrollHeight on a line-clamped `-webkit-box` overshoots the line grid by
// a few pixels even when nothing is hidden.
async function expectFullNameVisible(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  const heading = await canvas.findByRole('heading', { level: 2 });
  await waitFor(() => {
    const lineHeight = parseFloat(getComputedStyle(heading).lineHeight);
    const visibleLines = Math.round(heading.clientHeight / lineHeight);
    const naturalLines = Math.round(heading.scrollHeight / lineHeight);
    expect(visibleLines).toBeGreaterThanOrEqual(naturalLines);
    const row = heading.parentElement;
    if (!row) throw new Error('heading row not found');
    expect(row.clientHeight).toBeGreaterThanOrEqual(heading.clientHeight - 1);
  });
}

/**
 * Regression for #888: an active card at the size a ~900px-tall window
 * produces. The old layout flexed the heading and fixed the description at
 * six lines, so activating the card (divider + Start button mounting)
 * squeezed the title to a clipped single line. The name now outranks the
 * description: it always renders in full, and the description takes only
 * the whole lines that remain.
 */
export const SmallActiveCard: Story = {
  args: {
    name: 'Mental Health Networks - test',
    description:
      'An example template for studying how a personal network both supports ' +
      'a participant and adds stress while they manage their mental health. ' +
      'It uses separate name generators for supportive and difficult ' +
      'relationships, and records who knows about the participant’s ' +
      'mental health (disclosure).',
    size: 360,
    isActive: true,
  },
  play: async ({ canvasElement }) => {
    await expectFullNameVisible(canvasElement);
    await expectFooterInsideCard(canvasElement);
  },
};

/**
 * Long names step the heading size down (8cqi → 6.5cqi → 5cqi by character
 * count) so multi-line names stay inside the heading region instead of
 * squeezing the description and footer. Machine-style names wrap at
 * underscores (injected `<wbr>`) and hyphens.
 */
export const LongMachineName: Story = {
  args: {
    name: 'BRE_F03-KMP_FB_01_BASELINE_COHORT_2026_VARIANT_A',
    description: 'Wave one baseline collection for the FB cohort.',
  },
};

export const LongNaturalLanguageName: Story = {
  args: {
    name: 'Longitudinal Study of Social Support and Health Resource Access Among Recent Migrant Families',
    description: 'A study with a title that reads like its own abstract.',
  },
};

// Asserts the card's core layout guarantee: no matter how long the name,
// the heading region absorbs the squeeze (fitted whole-line clamp) and the
// footer button stays fully inside the card.
async function expectFooterInsideCard(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  const button = await canvas.findByRole('button', {
    name: 'Start new interview',
  });
  const card = button.closest('[aria-label]');
  if (!card) throw new Error('card root not found');
  await waitFor(() => {
    const buttonRect = button.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    expect(buttonRect.bottom).toBeLessThanOrEqual(cardRect.bottom + 1);
    expect(buttonRect.top).toBeGreaterThanOrEqual(cardRect.top);
    expect(buttonRect.height).toBeGreaterThan(0);
  });
}

/**
 * Pathological length: the smallest heading step plus the fitted line-clamp
 * backstop — the heading takes only the lines that fit its region, so the
 * footer is never pushed off the card. The full name stays available via
 * the heading's `title` attribute and the card's aria-label.
 */
export const ExtremelyLongName: Story = {
  args: {
    name:
      'COHORT_2026_BASELINE_BRE_F03-KMP_FB_01_SOCIAL_SUPPORT_AND_COMMUNITY_' +
      'HEALTH_RESOURCE_ACCESS_AMONG_RECENT_MIGRANT_FAMILIES_PILOT_REVISION_' +
      'FINAL_V2_APPROVED_COPY_DO_NOT_EDIT',
    description: 'Somebody exported this from a shared drive.',
  },
  play: async ({ canvasElement }) => {
    await expectFooterInsideCard(canvasElement);
  },
};

/**
 * Worst case both ways: pathological name AND a description long enough to
 * hit its own clamp. The heading region is the column's only flexible row,
 * so it absorbs the entire squeeze.
 */
export const ExtremelyLongNameAndDescription: Story = {
  args: {
    name:
      'COHORT_2026_BASELINE_BRE_F03-KMP_FB_01_SOCIAL_SUPPORT_AND_COMMUNITY_' +
      'HEALTH_RESOURCE_ACCESS_AMONG_RECENT_MIGRANT_FAMILIES_PILOT_REVISION_' +
      'FINAL_V2_APPROVED_COPY_DO_NOT_EDIT',
    description:
      'A comprehensive multi-stage protocol covering household composition, ' +
      'social support, health-service access, and community resource mapping ' +
      'across three waves of data collection with consent, screening, and ' +
      'debrief stages for each participating household member.',
  },
  play: async ({ canvasElement }) => {
    await expectFooterInsideCard(canvasElement);
  },
};

/**
 * The requires-internet pill shares the top row with the delete control.
 * Toggle `showDelete` in the controls panel: the pill glides to its new
 * position (shared region timing) while the control fades.
 */
export const RequiresInternetPill: Story = {
  args: {
    requiresInternetConnection: true,
  },
};

// Stand-in for NewSessionForm (which needs app providers the story can't
// host), sized like the real thing: label + hint, input, and the Cancel/submit
// row.
function CaseIdFormStandIn() {
  return (
    <div className="flex flex-col gap-4 text-base">
      <div>
        <div className="font-bold">Case ID</div>
        <div className="text-current/80">
          This will be shown on the resume interview screen to help you quickly
          identify this session.
        </div>
      </div>
      <div className="border-navy-taupe/40 rounded-full border px-4 py-3">
        &nbsp;
      </div>
      <div className="flex items-center justify-end gap-4">
        <button type="button">Cancel</button>
        <button type="button">Start interview</button>
      </div>
    </div>
  );
}

function renderCaseIdFormLayout({ name, size }: StoryArgs) {
  return (
    <ResizableFrame size={size}>
      <DeckCard
        protocol={makeProtocol({ name })}
        isActive
        sessionCount={0}
        onActivate={() => {}}
        onDelete={() => {}}
        hideControls
        hideDescription
        hideMetadata
        footer={
          <DeckCardFooter key="new-session">
            <CaseIdFormStandIn />
          </DeckCardFooter>
        }
      />
    </ResizableFrame>
  );
}

/**
 * The layout the case-ID form needs: the controls row, description, and
 * metadata all clear out (hideControls/hideDescription/hideMetadata), so a
 * long heading and the form share the card.
 */
export const CaseIdFormLayout: Story = {
  args: {
    name: 'Longitudinal Study of Social Support and Health Resource Access Among Recent Migrant Families',
  },
  render: renderCaseIdFormLayout,
};

/**
 * Regression for #888 (form overflow): on a card too small for the whole
 * form, the footer is capped at the card's leftover budget and scrolls
 * inside a ScrollArea — the submit row must be reachable by scrolling, never
 * clipped away by the card edge.
 */
export const CaseIdFormSmallCard: Story = {
  args: {
    name: 'Sample Protocol',
    size: 300,
  },
  render: renderCaseIdFormLayout,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const submit = await canvas.findByRole('button', {
      name: 'Start interview',
    });
    const card = submit.closest('[aria-label]');
    if (!card) throw new Error('card root not found');
    const viewport = card.querySelector('[data-deck-row="footer"] section');
    if (!(viewport instanceof HTMLElement)) {
      throw new Error('footer scroll viewport not found');
    }
    await waitFor(() => {
      viewport.scrollTop = viewport.scrollHeight;
      const submitRect = submit.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      expect(submitRect.height).toBeGreaterThan(0);
      expect(submitRect.bottom).toBeLessThanOrEqual(cardRect.bottom + 1);
      expect(submitRect.top).toBeGreaterThanOrEqual(cardRect.top - 1);
    });
    await expectFullNameVisible(canvasElement);
  },
};

/**
 * The loading/installing state with no information yet: empty Pattern seed
 * (plain platinum-dark surface), skeleton heading, description, and all
 * three metadata cells, and an indeterminate progress bar in place of the
 * Start button.
 */
export const Loading: Story = {
  render: ({ size }) => (
    <ResizableFrame size={size}>
      <DeckCard
        loading
        protocol={{}}
        footer={
          <DeckCardFooter key="import-progress">
            <DeckCardProgressFooter message="Fetching…" />
          </DeckCardFooter>
        }
      />
    </ResizableFrame>
  ),
};

/**
 * Loading with partial information: areas fill in progressively as values
 * become available, while the rest remain skeletons. The pattern is seeded
 * by the protocol name, so it appears together with the heading. The
 * progress fraction and status message are passed through from the protocol
 * import process.
 */
export const LoadingPartial: Story = {
  args: {
    progress: 0.45,
    progressMessage: 'Extracting…',
  },
  render: ({ name, description, progress, progressMessage, size }) => (
    <ResizableFrame size={size}>
      <DeckCard
        loading
        protocol={{ name, description }}
        footer={
          <DeckCardFooter key="import-progress">
            <DeckCardProgressFooter
              progress={progress}
              message={progressMessage}
            />
          </DeckCardFooter>
        }
      />
    </ResizableFrame>
  ),
};

// A fixed matrix of card sizes so every container tier is visible at once —
// the quickest way to eyeball responsiveness without dragging. Tiles are
// square, matching the deck's 1/1 card aspect.
const MATRIX_WIDTHS = [180, 240, 300, 360, 480] as const;

export const BreakpointMatrix: Story = {
  parameters: { layout: 'padded' },
  render: ({ name, description, importedAt, isActive, sessionCount }) => (
    <div className="flex flex-wrap items-start gap-6">
      {MATRIX_WIDTHS.map((w) => (
        <div key={w} className="flex flex-col items-center gap-2">
          <span className="font-monospace text-text/70 text-xs">{w}px</span>
          <div
            className="overflow-hidden rounded-[28px]"
            style={{ width: w, height: w }}
          >
            <DeckCard
              protocol={makeProtocol({
                name,
                description,
                importedAt,
                // Unique per card: DeckCard derives its Framer Motion
                // layoutIds from protocol.hash, so a shared hash across the
                // matrix would collide in one React tree.
                hash: `story-protocol-${w}`,
              })}
              isActive={isActive}
              sessionCount={sessionCount}
              onActivate={() => {}}
              onDelete={() => {}}
              footer={
                isActive ? (
                  <DeckCardFooter key="start-interview">
                    <DeckCardFooterButton onClick={() => {}}>
                      Start new interview
                    </DeckCardFooterButton>
                  </DeckCardFooter>
                ) : undefined
              }
            />
          </div>
        </div>
      ))}
    </div>
  ),
};

/**
 * The sample-protocol slot: the loading presentation (known name +
 * description, skeleton metadata) with an install button footer and a
 * dismiss control — composed entirely from DeckCard's footer and onDelete
 * props.
 */
export const SampleProtocol: Story = {
  render: ({ size }) => (
    <ResizableFrame size={size}>
      <DeckCard
        loading
        protocol={{
          name: SAMPLE_PROTOCOL.name,
          description: SAMPLE_PROTOCOL.description,
        }}
        isActive
        hideMetadata
        onActivate={() => {}}
        onDelete={() => {}}
        deleteLabel="Dismiss the sample protocol"
        footer={
          <DeckCardFooter key="install-sample">
            <DeckCardFooterButton color="primary" onClick={() => {}}>
              Install sample protocol
            </DeckCardFooterButton>
          </DeckCardFooter>
        }
      />
    </ResizableFrame>
  ),
};
