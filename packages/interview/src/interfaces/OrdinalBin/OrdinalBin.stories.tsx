import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { expect, waitFor } from 'storybook/test';
import SuperJSON from 'superjson';

import { SyntheticInterview } from '@codaco/protocol-utilities';
import type { VariableOption } from '@codaco/protocol-validation';

import StoryInterviewShell from '../../storybook-support/StoryInterviewShell';

const ORDINAL_LABELS = [
  'Strongly Disagree',
  'Disagree',
  'Slightly Disagree',
  'Neutral',
  'Slightly Agree',
  'Agree',
  'Strongly Agree',
];

// A real response set from a substance-use study.
const SURVEY_ORDINAL_LABELS = [
  'No, has not ever used drugs',
  'Yes, but not within 90 days before my incarceration',
  'Yes, within 90 days before my incarceration',
  'Don\u2019t Know',
  'Refuse to Answer',
];

const SURVEY_PROMPT_TEXT =
  'Other than marijuana, has this person ever used illicit drugs? (For example, stimulants like cocaine or meth, opioids like heroin, or prescription drugs (not prescribed or excess use)?';

// Sizes the interview to a fixed box instead of the viewport, so a story can
// pin a cramped case whatever the window running it happens to be.
const FRAMES = {
  'viewport': undefined,
  'phone-portrait': { width: 390, height: 844 },
  'phone-landscape': { width: 844, height: 390 },
} as const;

type Frame = keyof typeof FRAMES;

// Option labels are rendered as markdown, in RenderMarkdown's label dialect:
// inline emphasis, links and emoji, with block-level syntax unwrapped to text.
const MARKDOWN_ORDINAL_LABELS = [
  'No, has **never** used drugs',
  'Yes, but _not_ within 90 days before my incarceration',
  'Yes, **within 90 days** before my incarceration',
  'Don\u2019t Know',
  'Refuse to Answer',
];

type LabelSet = 'short' | 'survey' | 'markdown';

type ColorScale =
  | 'ord-color-seq-1'
  | 'ord-color-seq-2'
  | 'ord-color-seq-3'
  | 'ord-color-seq-4'
  | 'ord-color-seq-5'
  | 'ord-color-seq-6'
  | 'ord-color-seq-7'
  | 'ord-color-seq-8'
  | 'ord-color-seq-9'
  | 'ord-color-seq-10';

type StoryArgs = {
  binCount: number;
  hasMissingValue: boolean;
  colorScale: ColorScale;
  initialNodeCount: number;
  unassignedCount: number;
  promptCount: number;
  labelSet: LabelSet;
  frame: Frame;
};

function buildOptions(
  binCount: number,
  hasMissingValue: boolean,
  labelSet: LabelSet,
) {
  const options: VariableOption[] = [];

  // These sets are fixed instruments; their own length decides the bin count,
  // so `binCount` does not apply.
  const labels =
    labelSet === 'survey'
      ? SURVEY_ORDINAL_LABELS
      : labelSet === 'markdown'
        ? MARKDOWN_ORDINAL_LABELS
        : undefined;

  if (labels) {
    labels.forEach((label, i) => {
      options.push({ label, value: i });
    });
    if (hasMissingValue) {
      options.push({ label: 'N/A', value: -1 });
    }
    return options;
  }

  for (let i = 0; i < binCount; i++) {
    const label = ORDINAL_LABELS[i] ?? `Option ${i + 1}`;
    options.push({ label, value: i + 1 });
  }

  if (hasMissingValue) {
    options.push({ label: 'N/A', value: -1 });
  }

  return options;
}

function buildInterview(args: StoryArgs) {
  const interview = new SyntheticInterview();
  const options = buildOptions(
    args.binCount,
    args.hasMissingValue,
    args.labelSet,
  );

  const nodeType = interview.addNodeType({ name: 'Person' });

  const variables: string[] = [];
  for (let i = 0; i < args.promptCount; i++) {
    const ref = nodeType.addVariable({
      name: `Rating ${i + 1}`,
      type: 'ordinal',
      options,
    });
    variables.push(ref.id);
  }

  interview.addInformationStage({
    title: 'Welcome',
    text: 'Before the main stage.',
  });

  const stage = interview.addStage('OrdinalBin', {
    label: 'Rate People',
    initialNodes: { count: args.initialNodeCount },
    subject: { entity: 'node', type: nodeType.id },
  });

  for (let i = 0; i < args.promptCount; i++) {
    stage.addPrompt({
      variable: variables[i],
      text:
        args.labelSet === 'survey' || args.labelSet === 'markdown'
          ? SURVEY_PROMPT_TEXT
          : `Prompt ${i + 1}: How much do you agree with each person?`,
      color: args.colorScale,
    });
  }

  // Clear ordinal values on the first `unassignedCount` nodes so they appear
  // in the bucket (unassigned). By default SyntheticInterview auto-generates
  // values via ValueGenerator.
  const clampedUnassigned = Math.min(
    args.unassignedCount,
    args.initialNodeCount,
  );
  for (let i = 0; i < clampedUnassigned; i++) {
    for (const varId of variables) {
      interview.unsetNodeAttribute(i, varId);
    }
  }

  // When the "N/A" missing bin is present, explicitly drop the last couple of
  // assigned nodes into the negative-value option so the missing bin is visibly
  // populated rather than depending on the index-based value generator.
  if (args.hasMissingValue) {
    const missingValue = -1;
    const missingCount = Math.min(2, args.initialNodeCount - clampedUnassigned);
    for (
      let i = args.initialNodeCount - missingCount;
      i < args.initialNodeCount;
      i++
    ) {
      for (const varId of variables) {
        interview.setNodeAttribute(i, varId, missingValue);
      }
    }
  }

  interview.addInformationStage({
    title: 'Complete',
    text: 'After the main stage.',
  });

  return interview;
}

const OrdinalBinStoryWrapper = (args: StoryArgs) => {
  const configKey = JSON.stringify(args);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const interview = useMemo(() => buildInterview(args), [configKey]);
  const rawPayload = useMemo(
    () =>
      SuperJSON.stringify(interview.getInterviewPayload({ currentStep: 1 })),
    [interview],
  );

  const frame = FRAMES[args.frame];

  return (
    <div className={frame ? 'flex' : 'flex h-dvh w-full'} style={frame}>
      <StoryInterviewShell rawPayload={rawPayload} />
    </div>
  );
};

const meta: Meta<StoryArgs> = {
  title: 'Interfaces/OrdinalBin',
  parameters: {
    layout: 'fullscreen',
  },
  argTypes: {
    binCount: {
      control: { type: 'range', min: 2, max: 7 },
      description: 'Number of ordinal bins',
    },
    hasMissingValue: {
      control: 'boolean',
      description: 'Include a "N/A" bin with negative value',
    },
    colorScale: {
      control: 'select',
      options: [
        'ord-color-seq-1',
        'ord-color-seq-2',
        'ord-color-seq-3',
        'ord-color-seq-4',
        'ord-color-seq-5',
        'ord-color-seq-6',
        'ord-color-seq-7',
        'ord-color-seq-8',
        'ord-color-seq-9',
        'ord-color-seq-10',
      ],
      description: 'Color scale for the bins',
    },
    initialNodeCount: {
      control: { type: 'range', min: 0, max: 15 },
      description: 'Total number of nodes in the network',
    },
    unassignedCount: {
      control: { type: 'range', min: 0, max: 15 },
      description: 'Nodes without a value (appear in bucket)',
    },
    promptCount: {
      control: { type: 'range', min: 1, max: 4 },
      description: 'Number of prompts (pips appear for 2+)',
    },
    frame: {
      control: 'inline-radio',
      options: ['viewport', 'phone-portrait', 'phone-landscape'],
      description:
        'Render the interview at a fixed screen size rather than filling the window.',
    },
    labelSet: {
      control: 'inline-radio',
      options: ['short', 'survey', 'markdown'],
      description:
        'Which response set the prompt offers. "survey" is a real five-option instrument whose labels are full clauses; "markdown" shows authored emphasis. Both fix the bin count at five.',
    },
  },
  args: {
    binCount: 5,
    labelSet: 'short',
    frame: 'viewport',
    hasMissingValue: false,
    colorScale: 'ord-color-seq-1',
    initialNodeCount: 8,
    unassignedCount: 3,
    promptCount: 1,
  },
};

/**
 * Two readings, because the interface has failed both ways: a label can overrun
 * its own clipped box, or be centred in a box taller than the bin and pushed out
 * through the bin's clipped edge. Half a line box is the threshold for the
 * first — less is the leading under a descender, more is unreadable text.
 */
const expectLabelsFullyVisible = async (
  canvasElement: HTMLElement,
  binSelector: string,
  expectedCount: number,
) => {
  await waitFor(
    async () => {
      const bins = [...canvasElement.querySelectorAll(binSelector)];
      await expect(bins.length).toBe(expectedCount);

      for (const bin of bins) {
        const label = bin.querySelector('h3, h4');
        await expect(label).not.toBeNull();
        if (!(label instanceof HTMLElement)) return;

        const binBox = bin.getBoundingClientRect();
        const labelBox = label.getBoundingClientRect();
        await expect(labelBox.top).toBeGreaterThanOrEqual(binBox.top - 1);
        await expect(labelBox.bottom).toBeLessThanOrEqual(binBox.bottom + 1);

        const line = Number.parseFloat(getComputedStyle(label).lineHeight);
        await expect(label.scrollHeight - label.clientHeight).toBeLessThan(
          line / 2,
        );
        await expect(label.scrollWidth - label.clientWidth).toBeLessThanOrEqual(
          1,
        );
      }
    },
    { timeout: 10_000 },
  );
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {
  render: (args) => <OrdinalBinStoryWrapper {...args} />,
};

/**
 * A real five-option instrument whose ordered labels are full clauses. Every
 * label reads in full: each header is fitted to the room its bin has, stepping
 * down a size at a time rather than clipping.
 */
export const SurveyResponseSet: Story = {
  args: {
    labelSet: 'survey',
    initialNodeCount: 10,
    unassignedCount: 3,
  },
  render: (args) => <OrdinalBinStoryWrapper {...args} />,
  play: async ({ canvasElement }) => {
    await expectLabelsFullyVisible(
      canvasElement,
      '[data-testid^="ordinal-bin-"]',
      5,
    );
  },
};

/**
 * The same instrument in a window too short to give the headers the room they
 * would take by choice. Each label is fitted to what is left; none is cut.
 */
export const SurveyResponseSetInAShortWindow: Story = {
  args: {
    labelSet: 'survey',
    initialNodeCount: 10,
    unassignedCount: 3,
    frame: 'phone-landscape',
  },
  render: (args) => <OrdinalBinStoryWrapper {...args} />,
  play: async ({ canvasElement }) => {
    await expectLabelsFullyVisible(
      canvasElement,
      '[data-testid^="ordinal-bin-"]',
      5,
    );
  },
};

/**
 * Option labels are authored markdown. Inline emphasis renders inside the bin
 * header — bold goes heavier than the header's own weight, so it still reads as
 * emphasis — and the accessible name carries the same text without the syntax.
 */
export const MarkdownLabels: Story = {
  args: {
    labelSet: 'markdown',
    initialNodeCount: 10,
    unassignedCount: 3,
  },
  render: (args) => <OrdinalBinStoryWrapper {...args} />,
  play: async ({ canvasElement }) => {
    await waitFor(async () => {
      const bins = [
        ...canvasElement.querySelectorAll('[data-testid^="ordinal-bin-"]'),
      ];
      await expect(bins.length).toBe(5);

      // The emphasis is rendered, not printed...
      const strong = bins[0]?.querySelector('h4 strong');
      await expect(strong?.textContent).toBe('never');
      await expect(bins[1]?.querySelector('h4 em')?.textContent).toBe('not');

      // ...and heavier than the heading it sits in, or it would not read as
      // emphasis at all.
      const heading = bins[0]?.querySelector('h4');
      await expect(
        Number(getComputedStyle(strong!).fontWeight),
      ).toBeGreaterThan(Number(getComputedStyle(heading!).fontWeight));

      // Nothing a screen reader is handed carries the syntax.
      for (const bin of bins) {
        const named = [...bin.querySelectorAll('[aria-label]')];
        await expect(named.length).toBeGreaterThan(0);
        for (const element of named) {
          await expect(element.getAttribute('aria-label')).not.toMatch(/[*_]/);
        }
      }
    });
  },
};

/**
 * Demonstrates an ordinal bin that includes the special "missing" category: an
 * option whose `value` is negative (here `{ label: 'N/A', value: -1 }`). The
 * `OrdinalBinItem` detects the negative value and renders it with the distinct
 * "missing" styling, separating it from the regular ordered response bins.
 */
export const WithMissingValue: Story = {
  name: 'With "missing" (N/A) bin',
  args: {
    hasMissingValue: true,
    binCount: 5,
    initialNodeCount: 12,
    unassignedCount: 2,
  },
  render: (args) => <OrdinalBinStoryWrapper {...args} />,
};
