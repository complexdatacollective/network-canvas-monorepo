import type { Meta, StoryObj } from '@storybook/react-vite';
import { Provider } from 'react-redux';
import { createStore } from 'redux';

import {
  asEntityAttributeReference,
  type Variable,
  type VariableType,
} from '@codaco/protocol-validation';

import { VariablePill, type VariablePillProps } from './VariablePill';

const VARIABLE_TYPES = [
  'boolean',
  'categorical',
  'datetime',
  'layout',
  'location',
  'number',
  'ordinal',
  'scalar',
  'text',
] as const satisfies readonly VariableType[];

type StoryArgs = Pick<
  VariablePillProps,
  | 'animated'
  | 'editable'
  | 'label'
  | 'maxWidth'
  | 'minWidth'
  | 'type'
  | 'uuid'
  | 'variable'
  | 'width'
>;

const STORY_UUID = 'story-variable';

/**
 * The editor the pill opens is connected, so an editable pill needs codebook
 * state to read its variable from. Each story gets its own store, so opening
 * one editor cannot leave state behind for the next example.
 */
const createStoryStore = (variable: Variable) =>
  createStore(() => ({
    activeProtocol: {
      present: {
        codebook: {
          node: {
            person: { name: 'Person', variables: { [STORY_UUID]: variable } },
          },
          edge: {},
          ego: {},
        },
      },
    },
  }));

const createBareStoryVariable = (
  name: string,
  type: VariableType,
): Variable => {
  if (type === 'ordinal' || type === 'categorical') {
    return {
      name,
      type,
      options: [
        { label: 'Not at all', value: 0 },
        { label: 'Somewhat', value: 1 },
        { label: 'Very much', value: 2 },
      ],
    };
  }

  return { name, type };
};

const storyVariable = ({ label, type, variable }: StoryArgs): Variable => {
  if (variable?.type !== type) return createBareStoryVariable(label, type);
  return { ...variable, name: label };
};

const DEFAULT_STORY_VARIABLE = {
  name: 'participant_age',
  type: 'number',
  validation: {
    required: true,
    minValue: 18,
    maxValue: 80,
  },
  synthetic: {
    distribution: 'normal',
    mean: 42,
    sd: 12,
    min: 18,
    max: 80,
  },
} as const satisfies Variable;

const meta = {
  title: 'Components/VariablePill',
  component: VariablePill,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: `
\`VariablePill\` is the single presentation component for every variable
reference in Architect. Its semantics and visual treatment are controlled
independently:

| Props | Element and behavior | Use when |
| --- | --- | --- |
| \`editable={false}\`, \`animated={false}\` | Non-interactive \`<data>\` with a static type-colored border. | Picker options, query previews, stage configuration, and printable output. This is the default. |
| \`editable={false}\`, \`animated\` | Non-interactive \`<data>\` with an animated border. | A static on-screen reference needs extra visual emphasis. Never use this for printable output. |
| \`editable\` | A button that expands out of layout on hover/focus and moves into a modal editor when clicked. | The variable can be edited. Requires \`uuid\`, since the editor reads and writes the codebook. |
| \`ConnectedVariablePill\` | Resolves \`label\` and \`type\` from a variable UUID, validates uniqueness, then renders \`VariablePill\`. | Architect state owns the variable and edits must update the protocol codebook. |

\`\`\`tsx
// Metadata pills are content-sized between a 12rem minimum and 26rem maximum.
<VariablePill
  label="participant_age"
  type="number"
  variable={ageVariable}
/>

// Custom bounds; the label truncates after reaching maxWidth.
<VariablePill
  label="participant_neighbourhood_connection_frequency"
  type="number"
  minWidth="10rem"
  maxWidth="16rem"
/>

<ConnectedVariablePill
  animated
  editable
  uuid={variableId}
  width="100%"
/>
\`\`\`

- \`label\` is both the visible name and the machine-readable \`data\` value
  when the pill is not editable.
- \`type\` selects the variable icon and accent color.
- \`variable\` adds a compact metadata rail. Validation glyphs show each
  enabled rule when the pill has enough room. The pill is a CSS container, so
  narrower layouts replace multiple rules with one custom has-validations
  glyph instead of squeezing the label; expanding an editable pill reveals
  every rule. These custom constraint glyphs encode the rule directly and
  reuse the same mathematical operator wherever the rule is equivalent: all
  minimum constraints use ≥, all maximum constraints use ≤, and
  cross-variable comparisons use the matching plain operator. Variables
  without validation rules omit that visual slot; the accessible summary still
  reports the state. The final, wider glyph plots the effective synthetic
  distribution, including runtime defaults. Continuous curves and discrete
  bars use the resolved generator parameters, so their silhouettes reflect
  the configured shape and weights.
- Hovering a metadata glyph names it. Hovering or focusing an editable pill
  shows a \`Click to edit\` tooltip. If its name is truncated or validations
  are collapsed, the pill expands out of layout by the space needed for the
  complete label and validation rail, leaving its neighbours in place.
  Screen-reader descriptions continue to spell out the complete validation and
  synthetic-data summary.
- Without \`width\`, the pill grows with its content between \`minWidth\`
  (default \`12rem\`) and \`maxWidth\` (default \`20rem\`, or \`26rem\` when
  the metadata rail is present).
- Labels truncate with an ellipsis only after reaching \`maxWidth\`.
- The label section keeps a 6rem minimum before metadata is laid out beside
  it, preserving a readable variable-name target.
- \`width\` forces a preferred CSS width for contexts such as
  \`VariableSpotlight\`; unless \`maxWidth\` is also supplied, that width is
  used as the maximum.
- \`animated\` changes only the border treatment.
- \`editable\` changes the semantic element to a button. When its label is
  truncated, hover or keyboard focus lifts it out of layout, keeps a same-sized
  placeholder behind, and adds only the width needed to reveal the full name.
- Clicking moves that expanded pill to the top center over a modal backdrop.
  The name immediately becomes an autofocus field inside the moved pill; the
  remaining editor sections appear once in the attached popup below. Saving is
  one atomic codebook update, so it is a single undo step; Escape, Cancel, and
  backdrop dismissal all confirm before discarding an edited draft.
`,
      },
    },
  },
  args: {
    label: 'participant_age',
    type: 'number',
    animated: false,
    editable: false,
    variable: DEFAULT_STORY_VARIABLE,
  },
  argTypes: {
    label: {
      control: 'text',
      description: 'Displayed variable name.',
    },
    type: {
      control: 'select',
      options: VARIABLE_TYPES,
      description: 'Variable type, which selects the icon and accent color.',
    },
    width: {
      control: 'text',
      description:
        'Optional preferred CSS width. By default, width follows the content.',
    },
    minWidth: {
      control: 'text',
      description: 'Minimum CSS width. Defaults to 12rem.',
    },
    maxWidth: {
      control: 'text',
      description:
        'Maximum CSS width, after which the label truncates. Defaults to 20rem, or 26rem with metadata.',
    },
    animated: {
      control: 'boolean',
      description: 'Enables the animated border independently of editing.',
    },
    editable: {
      control: 'boolean',
      description:
        'Makes the pill an expanding button that moves into the modal variable editor. Requires `uuid`.',
    },
    uuid: {
      control: false,
      description:
        'Codebook id of the variable the editor reads and writes. Required for `editable`.',
    },
    variable: {
      control: false,
      description:
        'Optional full codebook variable used to render validation and synthetic-distribution metadata.',
    },
  },
  render: (args) => {
    const variable = storyVariable(args);
    return (
      <Provider
        store={createStoryStore(variable)}
        key={`${args.label}-${args.type}`}
      >
        <VariablePill {...args} variable={variable} />
      </Provider>
    );
  },
} satisfies Meta<StoryArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Static: Story = {};

export const Animated: Story = {
  args: {
    animated: true,
  },
};

export const Editable: Story = {
  args: {
    animated: true,
    editable: true,
    uuid: STORY_UUID,
  },
};

export const EditableStaticBorder: Story = {
  args: {
    editable: true,
    uuid: STORY_UUID,
  },
};

export const NoValidationDefaultDistribution: Story = {
  args: {
    variable: createBareStoryVariable('participant_age', 'number'),
  },
};

const MANY_VALIDATIONS_VARIABLE = {
  name: 'participant_age',
  type: 'number',
  validation: {
    required: true,
    minValue: 18,
    maxValue: 80,
    unique: true,
  },
  synthetic: {
    distribution: 'lognormal',
    mean: 42,
    sd: 12,
    min: 18,
    max: 80,
  },
} as const satisfies Variable;

export const ManyValidations: Story = {
  args: {
    variable: MANY_VALIDATIONS_VARIABLE,
  },
};

export const EditableManyValidations: Story = {
  args: {
    animated: true,
    editable: true,
    uuid: STORY_UUID,
    variable: MANY_VALIDATIONS_VARIABLE,
  },
};

export const CategoricalDistribution: Story = {
  args: {
    label: 'support_types',
    type: 'categorical',
    variable: {
      name: 'support_types',
      type: 'categorical',
      options: [
        { label: 'Emotional', value: 'emotional' },
        { label: 'Practical', value: 'practical' },
        { label: 'Financial', value: 'financial' },
      ],
      validation: { minSelected: 1, maxSelected: 2 },
      synthetic: {
        optionWeights: [
          { value: 'emotional', weight: 3 },
          { value: 'practical', weight: 2 },
          { value: 'financial', weight: 1 },
        ],
        selectionCount: {
          probabilities: [
            { count: 1, probability: 0.75 },
            { count: 2, probability: 0.25 },
          ],
        },
      },
    },
  },
};

const DISTRIBUTION_VARIABLES = [
  {
    name: 'uniform_score',
    type: 'number',
    synthetic: { distribution: 'uniform', min: 0, max: 100 },
  },
  {
    name: 'normal_score',
    type: 'number',
    synthetic: { distribution: 'normal', mean: 50, sd: 12 },
  },
  {
    name: 'lognormal_score',
    type: 'number',
    synthetic: { distribution: 'lognormal', mean: 40, sd: 30 },
  },
  {
    name: 'fixed_score',
    type: 'number',
    synthetic: { distribution: 'constant', value: 42 },
  },
  {
    name: 'skewed_scalar',
    type: 'scalar',
    synthetic: { distribution: 'beta', mean: 0.25, sd: 0.12 },
  },
  {
    name: 'consent',
    type: 'boolean',
    synthetic: { probabilityTrue: 0.75 },
  },
  {
    name: 'frequency',
    type: 'ordinal',
    options: [
      { label: 'Never', value: 0 },
      { label: 'Sometimes', value: 1 },
      { label: 'Often', value: 2 },
      { label: 'Always', value: 3 },
    ],
    synthetic: {
      optionWeights: [
        { value: 0, weight: 1 },
        { value: 1, weight: 3 },
        { value: 2, weight: 5 },
        { value: 3, weight: 2 },
      ],
    },
  },
] as const satisfies readonly Variable[];

export const DistributionShapes: Story = {
  render: () => (
    <div className="grid gap-3">
      {DISTRIBUTION_VARIABLES.map((variable) => (
        <VariablePill
          key={variable.name}
          label={variable.name}
          type={variable.type}
          variable={variable}
        />
      ))}
    </div>
  ),
  parameters: {
    layout: 'padded',
  },
};

const COMPARISON_REFERENCE = asEntityAttributeReference('comparison-variable');

const VALIDATION_VARIABLES = [
  {
    name: 'required',
    type: 'text',
    validation: { required: true },
  },
  {
    name: 'minimum_length',
    type: 'text',
    validation: { minLength: 2 },
  },
  {
    name: 'maximum_length',
    type: 'text',
    validation: { maxLength: 80 },
  },
  {
    name: 'minimum_value',
    type: 'number',
    validation: { minValue: 0 },
  },
  {
    name: 'maximum_value',
    type: 'number',
    validation: { maxValue: 100 },
  },
  {
    name: 'minimum_selections',
    type: 'categorical',
    options: [
      { label: 'One', value: 1 },
      { label: 'Two', value: 2 },
    ],
    validation: { minSelected: 1 },
  },
  {
    name: 'maximum_selections',
    type: 'categorical',
    options: [
      { label: 'One', value: 1 },
      { label: 'Two', value: 2 },
    ],
    validation: { maxSelected: 1 },
  },
  {
    name: 'unique_value',
    type: 'text',
    validation: { unique: true },
  },
  {
    name: 'different_from',
    type: 'text',
    validation: { differentFrom: COMPARISON_REFERENCE },
  },
  {
    name: 'same_as',
    type: 'text',
    validation: { sameAs: COMPARISON_REFERENCE },
  },
  {
    name: 'greater_than',
    type: 'number',
    validation: { greaterThanVariable: COMPARISON_REFERENCE },
  },
  {
    name: 'less_than',
    type: 'number',
    validation: { lessThanVariable: COMPARISON_REFERENCE },
  },
  {
    name: 'greater_or_equal',
    type: 'number',
    validation: { greaterThanOrEqualToVariable: COMPARISON_REFERENCE },
  },
  {
    name: 'less_or_equal',
    type: 'number',
    validation: { lessThanOrEqualToVariable: COMPARISON_REFERENCE },
  },
] as const satisfies readonly Variable[];

export const ValidationShapes: Story = {
  render: () => (
    <div className="flex flex-wrap items-start gap-3">
      {VALIDATION_VARIABLES.map((variable) => (
        <VariablePill
          key={variable.name}
          label={variable.name}
          type={variable.type}
          variable={variable}
        />
      ))}
    </div>
  ),
  parameters: {
    layout: 'padded',
  },
};

export const LongLabel: Story = {
  args: {
    animated: true,
    editable: true,
    uuid: STORY_UUID,
    label: 'participant_neighbourhood_connection_frequency',
    maxWidth: '16rem',
  },
};

export const MinimumWidth: Story = {
  args: {
    label: 'age',
  },
};

export const ContentSized: Story = {
  args: {
    label: 'participant_neighbourhood',
  },
};

export const MaximumWidth: Story = {
  args: {
    label:
      'participant_neighbourhood_connection_frequency_during_the_last_year',
    maxWidth: '16rem',
  },
};

export const FullWidth: Story = {
  args: {
    width: '100%',
  },
  parameters: {
    layout: 'padded',
  },
};
