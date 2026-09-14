import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { expect, waitFor } from 'storybook/test';
import SuperJSON from 'superjson';

import { SyntheticInterview } from '@codaco/protocol-utilities';
import type { VariableOption } from '@codaco/protocol-validation';

import StoryInterviewShell from '../../storybook-support/StoryInterviewShell';

const CATEGORY_LABELS = [
  'Family',
  'Work',
  'School',
  'Neighborhood',
  'Social',
  'Online',
  'Sports',
  'Religious',
  'Political',
  'Other',
];

// A researcher can author a category label of any length, and a participant
// can name a person anything at all. Both end up inside a bin circle, which
// clips to its own shape — so both are edge cases the layout has to survive.
const LONG_CATEGORY_LABEL =
  'People I know through my extended family and their close friends';
const LONG_NODE_NAME =
  'Aleksandra Konstantina Kowalczyk-Nowakowska de la Fuente y Villanueva';

// A real response set from a criminal-legal-system study.
const SURVEY_CATEGORY_LABELS = [
  'Never been involved in the criminal legal system',
  'Previously involved in the criminal legal system, but not currently',
  'Currently incarcerated or on community supervision',
  'Don\u2019t Know',
  'Refuse to Answer',
];

// The pressure case: no bin is large and no label is short.
const SENTENCE_CATEGORY_LABELS = [
  'People I know through my extended family and their close friends',
  'People I met through work, including former colleagues',
  'People I was at school or university with',
  'Neighbours and other people who live close to me',
  'People I know through a place of worship or a faith community',
  'People I only know online and have never met in person',
  'People I play or watch sport with',
  'People I met through volunteering or community organising',
  'People I know through a political party or campaign',
  'Someone who does not fit any of the other descriptions',
];

const SURVEY_PROMPT_TEXT =
  'What best describes each person\u2019s history of involvement with the criminal legal system? By \u201Cinvolvement,\u201D I mean if they\u2019ve been arrested, on probation/parole, in drug court, or in jail/prison.';

// Option labels are rendered as markdown, in RenderMarkdown's label dialect:
// inline emphasis, links and emoji, with block-level syntax unwrapped to text.
const MARKDOWN_CATEGORY_LABELS = [
  'Never been **involved** in the criminal legal system',
  'Previously involved, but _not currently_',
  'Currently incarcerated or on community supervision',
  'Don\u2019t Know',
  'Refuse to Answer',
];

type LabelSet = 'short' | 'survey' | 'sentences' | 'markdown';

type StoryArgs = {
  categoryCount: number;
  hasMissingValue: boolean;
  hasOtherOption: boolean;
  otherReasonRequired: boolean;
  initialNodeCount: number;
  unassignedCount: number;
  promptCount: number;
  longLabels: boolean;
  labelSet: LabelSet;
};

function buildOptions(
  categoryCount: number,
  hasMissingValue: boolean,
  longLabels: boolean,
  labelSet: LabelSet,
) {
  const options: VariableOption[] = [];

  if (hasMissingValue) {
    options.push({ label: 'N/A', value: -1 });
  }

  if (labelSet === 'markdown') {
    MARKDOWN_CATEGORY_LABELS.forEach((label, i) => {
      options.push({ label, value: i });
    });
    return options;
  }

  if (labelSet === 'sentences') {
    for (let i = 0; i < categoryCount; i++) {
      options.push({
        label: SENTENCE_CATEGORY_LABELS[i % SENTENCE_CATEGORY_LABELS.length]!,
        value: i + 1,
      });
    }
    return options;
  }

  if (labelSet === 'survey') {
    // The survey set is a fixed instrument; its own length decides the bin
    // count, so `categoryCount` does not apply.
    SURVEY_CATEGORY_LABELS.forEach((label, i) => {
      options.push({ label, value: i });
    });
    return options;
  }

  for (let i = 0; i < categoryCount; i++) {
    const label =
      longLabels && i === 0
        ? LONG_CATEGORY_LABEL
        : (CATEGORY_LABELS[i] ?? `Category ${i + 1}`);
    options.push({ label, value: i + 1 });
  }

  return options;
}

function buildInterview(args: StoryArgs) {
  const interview = new SyntheticInterview();
  const options = buildOptions(
    args.categoryCount,
    args.hasMissingValue,
    args.longLabels,
    args.labelSet,
  );

  const nodeType = interview.addNodeType({ name: 'Person' });

  // `component` here is incidental, not required: the "Other" dialog derives
  // validation directly from the codebook variable without resolving a
  // component, so an otherVariable created without one (e.g. via Architect's
  // "Create New Variable" dialog) works identically. `validation` is
  // deliberately omitted unless `otherReasonRequired` is set, so the story can
  // demonstrate that the dialog follows the codebook rule rather than imposing
  // its own required state.
  const otherVariableId = args.hasOtherOption
    ? nodeType.addVariable({
        name: 'Other Reason',
        type: 'text',
        component: 'Text',
        ...(args.otherReasonRequired ? { validation: { required: true } } : {}),
      }).id
    : undefined;

  const variables: string[] = [];
  for (let i = 0; i < args.promptCount; i++) {
    const ref = nodeType.addVariable({
      name: `Category ${i + 1}`,
      type: 'categorical',
      options,
    });
    variables.push(ref.id);
  }

  interview.addInformationStage({
    title: 'Welcome',
    text: 'Before the main stage.',
  });

  const stage = interview.addStage('CategoricalBin', {
    label: 'Categorise People',
    initialNodes: { count: args.initialNodeCount },
    subject: { entity: 'node', type: nodeType.id },
  });

  for (let i = 0; i < args.promptCount; i++) {
    stage.addPrompt({
      variable: variables[i],
      text:
        args.labelSet === 'survey' || args.labelSet === 'markdown'
          ? SURVEY_PROMPT_TEXT
          : `Prompt ${i + 1}: Which categories does each person belong to?`,
      ...(otherVariableId && {
        otherVariable: otherVariableId,
        otherVariablePrompt: 'Please specify the other category:',
        otherOptionLabel: 'Other',
      }),
    });
  }

  // Clear categorical values on the first `unassignedCount` nodes so they
  // appear in the bucket (uncategorised).
  const clampedUnassigned = Math.min(
    args.unassignedCount,
    args.initialNodeCount,
  );
  for (let i = 0; i < clampedUnassigned; i++) {
    for (const varId of variables) {
      interview.unsetNodeAttribute(i, varId);
    }
    if (otherVariableId) {
      interview.unsetNodeAttribute(i, otherVariableId);
    }
  }

  if (args.longLabels) {
    // `addNodeType` seeds the "name" text variable first, so it leads the
    // type's variable list. Every node gets the long name, so whichever one
    // sorts first into a bin is the one the bin summarises.
    const nameVariableId = interview.getVariableIds(nodeType.id)[0];
    if (nameVariableId) {
      for (let i = 0; i < args.initialNodeCount; i++) {
        interview.setNodeAttribute(i, nameVariableId, LONG_NODE_NAME);
      }
    }
  }

  interview.addInformationStage({
    title: 'Complete',
    text: 'After the main stage.',
  });

  return interview;
}

const CategoricalBinStoryWrapper = (args: StoryArgs) => {
  const configKey = JSON.stringify(args);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const interview = useMemo(() => buildInterview(args), [configKey]);
  const rawPayload = useMemo(
    () =>
      SuperJSON.stringify(interview.getInterviewPayload({ currentStep: 1 })),
    [interview],
  );

  return (
    <div className="flex h-dvh w-full">
      <StoryInterviewShell rawPayload={rawPayload} />
    </div>
  );
};

const meta: Meta<StoryArgs> = {
  title: 'Interfaces/CategoricalBin',
  parameters: {
    layout: 'fullscreen',
  },
  argTypes: {
    categoryCount: {
      control: { type: 'range', min: 2, max: 10 },
      description: 'Number of categories',
    },
    hasMissingValue: {
      control: 'boolean',
      description: 'Include a "N/A" category with negative value',
    },
    hasOtherOption: {
      control: 'boolean',
      description: 'Add an "Other" bin with a text input prompt',
    },
    otherReasonRequired: {
      control: 'boolean',
      description:
        'Apply a codebook `required` rule to the "Other" reason variable.',
    },
    initialNodeCount: {
      control: { type: 'range', min: 0, max: 15 },
      description: 'Total number of nodes in the network',
    },
    unassignedCount: {
      control: { type: 'range', min: 0, max: 15 },
      description: 'Nodes without a category (appear in bucket)',
    },
    promptCount: {
      control: { type: 'range', min: 1, max: 4 },
      description: 'Number of prompts (pips appear for 2+)',
    },
    longLabels: {
      control: 'boolean',
      description:
        'Give the first category and every person a label far longer than a bin can show',
    },
    labelSet: {
      control: 'inline-radio',
      options: ['short', 'survey', 'sentences', 'markdown'],
      description:
        'Which response set the prompt offers. "survey" is a real five-option instrument whose labels are full sentences, and fixes the bin count at five; "sentences" gives every option a sentence-length label at whatever bin count is set.',
    },
  },
  args: {
    categoryCount: 4,
    hasMissingValue: false,
    hasOtherOption: false,
    otherReasonRequired: false,
    initialNodeCount: 8,
    unassignedCount: 3,
    promptCount: 1,
    longLabels: false,
    labelSet: 'short',
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
  render: (args) => <CategoricalBinStoryWrapper {...args} />,
};

export const LabelsLongerThanTheBin: Story = {
  args: {
    longLabels: true,
    unassignedCount: 2,
  },
  render: (args) => <CategoricalBinStoryWrapper {...args} />,
  parameters: {
    docs: {
      description: {
        story:
          'Every person carries a name far longer than a bin circle can show, and the first category label overruns too. Both clamp to an ellipsis inside the circle rather than growing the stack — the category name stays visible, and the count of everyone else in the bin survives the truncation. The full membership is one tap away in the expanded panel.',
      },
    },
  },
};

export const SurveyResponseSet: Story = {
  args: {
    labelSet: 'survey',
    unassignedCount: 3,
  },
  render: (args) => <CategoricalBinStoryWrapper {...args} />,
  play: async ({ canvasElement }) => {
    await expectLabelsFullyVisible(canvasElement, '.catbin-item', 5);
  },
  parameters: {
    docs: {
      description: {
        story:
          'A real five-option instrument, three of whose labels are full sentences. Every label reads in full: the title takes as much of the circle as it needs, stepping down a size at a time, and the membership summary stands aside when the label wants the room.',
      },
    },
  },
};

export const TenSentenceLabels: Story = {
  args: {
    labelSet: 'sentences',
    categoryCount: 10,
    unassignedCount: 3,
  },
  render: (args) => <CategoricalBinStoryWrapper {...args} />,
  play: async ({ canvasElement }) => {
    await expectLabelsFullyVisible(canvasElement, '.catbin-item', 10);
  },
  parameters: {
    docs: {
      description: {
        story:
          'Ten options, every one of them a sentence, so each circle is small and none of the text is short. Every label still reads in full.',
      },
    },
  },
};

export const MarkdownLabels: Story = {
  args: {
    labelSet: 'markdown',
    unassignedCount: 3,
  },
  render: (args) => <CategoricalBinStoryWrapper {...args} />,
  play: async ({ canvasElement }) => {
    await waitFor(async () => {
      const bins = [...canvasElement.querySelectorAll('.catbin-item')];
      await expect(bins.length).toBe(5);

      // The emphasis is rendered, not printed...
      const strong = bins[0]?.querySelector('h4 strong');
      await expect(strong?.textContent).toBe('involved');
      await expect(bins[1]?.querySelector('h4 em')?.textContent).toBe(
        'not currently',
      );

      // ...and heavier than the heading it sits in, or it would not read as
      // emphasis at all.
      const heading = bins[0]?.querySelector('h4');
      await expect(
        Number(getComputedStyle(strong!).fontWeight),
      ).toBeGreaterThan(Number(getComputedStyle(heading!).fontWeight));

      // …and a screen reader is read the text, not the syntax around it.
      for (const bin of bins) {
        await expect(bin.getAttribute('aria-label')).not.toMatch(/[*_]/);
      }
      await expect(bins[0]?.getAttribute('aria-label')).toContain(
        'Never been involved in the criminal legal system',
      );
    });
  },
  parameters: {
    docs: {
      description: {
        story:
          "Option labels are authored markdown. Inline emphasis renders inside the bin \u2014 bold goes heavier than the label's own weight, so it still reads as emphasis \u2014 and the accessible name carries the same text without the syntax.",
      },
    },
  },
};

export const OtherBinRequiresAReason: Story = {
  args: {
    hasOtherOption: true,
    otherReasonRequired: true,
    unassignedCount: 3,
  },
  render: (args) => <CategoricalBinStoryWrapper {...args} />,
  parameters: {
    docs: {
      description: {
        story:
          'The "Other" reason variable has a codebook `required` rule, so an empty submission is rejected. Turn `otherReasonRequired` off to allow an empty response.',
      },
    },
  },
};
