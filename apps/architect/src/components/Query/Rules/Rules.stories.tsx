import type { Meta, StoryObj } from '@storybook/react-vite';
import { useId, useState } from 'react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { ScrollArea } from '@codaco/fresco-ui/ScrollArea';
import Heading from '@codaco/fresco-ui/typography/Heading';

import Rules, { type RulesOuterProps } from './Rules';
import type { Rule } from './validateRule';

type RulesStoryArgs = Extract<RulesOuterProps, { type: 'query' }>;

const ORDINAL_OPTIONS = [
  { value: 'never', label: 'Never' },
  { value: 'sometimes', label: 'Sometimes' },
  { value: 'often', label: 'Often' },
];

const CATEGORY_OPTIONS = [
  { value: 'family', label: 'Family' },
  { value: 'friends', label: 'Friends' },
  { value: 'work', label: 'Work' },
  {
    value: 'withdraw',
    label:
      '**No. I decline to** participate, and wish to immediately withdraw from this study.',
  },
];

const CODEBOOK = {
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: {
        displayName: { name: 'Display name', type: 'text' },
        interviewDate: { name: 'Interview date', type: 'datetime' },
        layoutGroup: { name: 'Layout group', type: 'layout' },
        frequency: {
          name: 'Contact frequency',
          type: 'ordinal',
          options: ORDINAL_OPTIONS,
        },
        groups: {
          name: 'Group memberships',
          type: 'categorical',
          options: CATEGORY_OPTIONS,
        },
      },
    },
  },
  edge: {
    friendship: {
      name: 'Friendship',
      color: 'edge-color-seq-2',
      variables: {
        notes: { name: 'Relationship notes', type: 'text' },
        yearsKnown: { name: 'Years known', type: 'number' },
        contexts: {
          name: 'Relationship contexts',
          type: 'categorical',
          options: CATEGORY_OPTIONS,
        },
      },
    },
  },
  ego: {
    variables: {
      consent: { name: 'Consent given', type: 'boolean' },
      score: { name: 'Wellbeing score', type: 'scalar' },
      home: { name: 'Home location', type: 'location' },
      frequency: {
        name: 'Participation frequency',
        type: 'ordinal',
        options: ORDINAL_OPTIONS,
      },
      groups: {
        name: 'Selected groups',
        type: 'categorical',
        options: CATEGORY_OPTIONS,
      },
    },
  },
};

const createStoryStore = () =>
  createStore(() => ({
    activeProtocol: { present: { codebook: CODEBOOK } },
  }));

/**
 * One example for every operator exposed by the rule editor, distributed
 * across node, edge and ego targets and all supported variable types.
 */
const ALL_RULE_EXAMPLES: Rule[] = [
  {
    id: 'node-type-exists',
    type: 'node',
    options: { type: 'person', operator: 'EXISTS' },
  },
  {
    id: 'edge-type-does-not-exist',
    type: 'edge',
    options: { type: 'friendship', operator: 'NOT_EXISTS' },
  },
  {
    id: 'node-text-contains',
    type: 'node',
    options: {
      type: 'person',
      attribute: 'displayName',
      operator: 'CONTAINS',
      value: '^A',
    },
  },
  {
    id: 'edge-text-does-not-contain',
    type: 'edge',
    options: {
      type: 'friendship',
      attribute: 'notes',
      operator: 'DOES_NOT_CONTAIN',
      value: 'work',
    },
  },
  {
    id: 'ego-boolean-exactly',
    type: 'ego',
    options: { attribute: 'consent', operator: 'EXACTLY', value: true },
  },
  {
    id: 'node-layout-not',
    type: 'node',
    options: {
      type: 'person',
      attribute: 'layoutGroup',
      operator: 'NOT',
      value: 'group-a',
    },
  },
  {
    id: 'edge-number-greater-than',
    type: 'edge',
    options: {
      type: 'friendship',
      attribute: 'yearsKnown',
      operator: 'GREATER_THAN',
      value: 5,
    },
  },
  {
    id: 'ego-scalar-greater-than-or-equal',
    type: 'ego',
    options: {
      attribute: 'score',
      operator: 'GREATER_THAN_OR_EQUAL',
      value: 75,
    },
  },
  {
    id: 'node-datetime-less-than',
    type: 'node',
    options: {
      type: 'person',
      attribute: 'interviewDate',
      operator: 'LESS_THAN',
      value: '2026-01-01',
    },
  },
  {
    id: 'edge-number-less-than-or-equal',
    type: 'edge',
    options: {
      type: 'friendship',
      attribute: 'yearsKnown',
      operator: 'LESS_THAN_OR_EQUAL',
      value: 10,
    },
  },
  {
    id: 'ego-categorical-includes-values',
    type: 'ego',
    options: {
      attribute: 'groups',
      operator: 'INCLUDES',
      value: ['family', 'withdraw'],
    },
  },
  {
    id: 'node-ordinal-excludes',
    type: 'node',
    options: {
      type: 'person',
      attribute: 'frequency',
      operator: 'EXCLUDES',
      value: 'never',
    },
  },
  {
    id: 'edge-categorical-options-greater-than',
    type: 'edge',
    options: {
      type: 'friendship',
      attribute: 'contexts',
      operator: 'OPTIONS_GREATER_THAN',
      value: 2,
    },
  },
  {
    id: 'ego-categorical-options-less-than',
    type: 'ego',
    options: {
      attribute: 'groups',
      operator: 'OPTIONS_LESS_THAN',
      value: 3,
    },
  },
  {
    id: 'node-categorical-options-equals',
    type: 'node',
    options: {
      type: 'person',
      attribute: 'groups',
      operator: 'OPTIONS_EQUALS',
      value: 2,
    },
  },
  {
    id: 'edge-categorical-options-not-equals',
    type: 'edge',
    options: {
      type: 'friendship',
      attribute: 'contexts',
      operator: 'OPTIONS_NOT_EQUALS',
      value: 1,
    },
  },
  {
    id: 'ego-location-exactly',
    type: 'ego',
    options: {
      attribute: 'home',
      operator: 'EXACTLY',
      value: 'Cape Town',
    },
  },
];

const toRuleSetValue = (
  candidate: unknown,
): { rules: Rule[]; join: string | undefined } | null => {
  if (
    !candidate ||
    typeof candidate !== 'object' ||
    !('rules' in candidate) ||
    !Array.isArray(candidate.rules)
  ) {
    return null;
  }

  return {
    rules: candidate.rules as Rule[],
    join:
      'join' in candidate && typeof candidate.join === 'string'
        ? candidate.join
        : undefined,
  };
};

const RuleFieldStory = ({ rules = [], join, ...props }: RulesOuterProps) => {
  const labelId = useId();
  const [value, setValue] = useState({ rules, join });

  return (
    <div className="flex h-dvh min-h-0 flex-col p-4">
      <ScrollArea
        aria-label="All rule types"
        className="publish-colors bg-background"
        viewportClassName="px-1"
      >
        <div className="mx-auto w-full max-w-6xl space-y-4 pb-4">
          <Heading id={labelId} level="label" margin="none">
            Rules
          </Heading>
          <Rules
            {...props}
            aria-labelledby={labelId}
            rules={value.rules}
            join={value.join}
            onChange={(nextValue) => {
              const parsedValue = toRuleSetValue(nextValue);
              if (parsedValue) setValue(parsedValue);
            }}
          />
        </div>
      </ScrollArea>
    </div>
  );
};

const meta = {
  title: 'Components/Form/Rules',
  component: Rules,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <Provider store={createStoryStore()}>
        <Story />
      </Provider>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: `
The rule builder is Architect's editable list for skip-logic and network-filter
rules. Each row presents a complete rule sentence with separate edit and delete
actions; the shared ArrayField pattern owns adding, focus return, deletion and
empty state behavior, and the editor dialog is an ordinary Architect form.

The **All rule types** story is an exhaustive visual inventory: it covers node
and edge presence rules, node/edge/ego attribute rules, every attribute type,
every operator the rule editor exposes, and multi-value categorical operands.
The story remains fully interactive inside a keyboard-accessible scroll area,
so each example can be edited, removed, or supplemented with a new rule.

The **Authoring a rule** story drives the editor itself, in a real browser with
the real dialog and form store behind it.
`,
      },
    },
  },
  args: {
    type: 'query',
    addRuleLabel: 'Add new skip logic rule',
    rules: ALL_RULE_EXAMPLES,
    join: 'AND',
    codebook: CODEBOOK,
    allowEdgeRules: true,
  },
  argTypes: {
    rules: { control: false },
    join: { control: false },
    codebook: { control: false },
    type: { control: false },
    addRuleLabel: { control: false },
    allowEdgeRules: { control: false },
    onChange: { control: false },
  },
  render: (args) => <RuleFieldStory {...args} />,
} satisfies Meta<RulesStoryArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllRuleTypes: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getAllByRole('listitem')).toHaveLength(
      ALL_RULE_EXAMPLES.length,
    );
    await expect(
      canvas.getByRole('button', { name: 'Add new skip logic rule' }),
    ).toBeVisible();

    const multiValueRule = canvas.getAllByRole('listitem').find((item) =>
      within(item).queryByRole('button', {
        name: /^Edit rule: Ego has categorical attribute Selected groups that includes Family,/,
      }),
    );

    await expect(multiValueRule).toBeDefined();
    const values = multiValueRule?.querySelectorAll('[data-rule-part="value"]');

    await expect(values).toHaveLength(2);
    await expect(values?.[0]).toHaveTextContent('Family');
    await expect(values?.[1]).toHaveTextContent(
      'No. I decline to participate, and wish to immediately withdraw from this study.',
    );
  },
};

/**
 * The editor is a form like every other Architect editor: it refuses an
 * incomplete rule by naming the control that is missing — including one the
 * researcher has never touched, which is the whole point of `required` — and
 * commits exactly the rule the row then reads back.
 */
export const AuthoringARule: Story = {
  args: { rules: [], join: undefined },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The dialog is portalled out of the story's own subtree.
    const page = within(document.body);

    await userEvent.click(
      canvas.getByRole('button', { name: 'Add new skip logic rule' }),
    );
    const dialog = await page.findByRole('dialog', {
      name: 'Construct a Rule',
    });

    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Finish and Close' }),
    );
    await expect(
      await within(dialog).findByText('This field is required.'),
    ).toBeVisible();

    await userEvent.click(
      within(dialog).getByRole('radio', { name: /^Ego -/ }),
    );
    const ruleStructure = await within(dialog).findByRole('region', {
      name: 'Rule structure',
    });
    const structure = within(ruleStructure);
    await expect(
      structure.getByText(
        'Choose an attribute, operator, and comparison value to define this rule.',
      ),
    ).toBeVisible();
    await userEvent.click(
      await structure.findByRole('button', { name: 'Select attribute' }),
    );
    const attributeSearch = await page.findByRole('searchbox', {
      name: 'Find or create an attribute',
    });
    await userEvent.type(attributeSearch, 'Consent given');
    await userEvent.keyboard('{Enter}');
    await expect(
      await structure.findByRole('button', { name: 'Change attribute' }),
    ).toBeVisible();
    await userEvent.selectOptions(
      await structure.findByRole('combobox', { name: /^Operator/ }),
      'EXACTLY',
    );
    await userEvent.click(await structure.findByRole('radio', { name: 'Yes' }));
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Finish and Close' }),
    );

    await waitFor(async () =>
      expect(
        await canvas.findByRole('button', {
          name: 'Edit rule: Ego has boolean attribute Consent given that is exactly equal to true',
        }),
      ).toBeVisible(),
    );
  },
};
