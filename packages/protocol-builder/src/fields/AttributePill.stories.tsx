import type { Meta, StoryObj } from '@storybook/react-vite';

import type { VariableType } from '@codaco/protocol-validation';

import AttributePill from './AttributePill.tsx';

const EVERY_TYPE: readonly VariableType[] = [
  'text',
  'number',
  'boolean',
  'ordinal',
  'categorical',
  'scalar',
  'datetime',
  'layout',
  'location',
];

const meta = {
  title: 'Protocol Builder/Fields/Attribute pill',
  component: AttributePill,
  parameters: {
    docs: {
      description: {
        component:
          'One attribute, shown as the researcher’s name for it over the colour and icon of the kind of answer it holds. The kind decides what can be asked about an attribute and what a rule can compare it against, so a list of three dozen is unreadable without it. It says nothing to a screen reader about the kind itself: where it renders inside a list row, that row’s accessible name has to be the attribute’s own name, so whoever renders the pill states the kind beside it.',
      },
    },
  },
  args: { name: 'nominated_early', type: 'boolean' },
  tags: ['autodocs'],
} satisfies Meta<typeof AttributePill>;

export default meta;
type Story = StoryObj<typeof meta>;

/** One attribute, as it reads beside the control that holds it. */
export const OneAttribute: Story = {};

/**
 * The nine kinds of answer the protocol schema defines, in the colours
 * Architect has shown them in since its codebook editor was written — so a
 * researcher moving between the two apps reads one vocabulary.
 */
export const EveryKindOfAnswer: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-2">
      {EVERY_TYPE.map((type) => (
        <AttributePill key={type} name={type} type={type} />
      ))}
    </div>
  ),
};

/**
 * A row that stands for something other than a codebook attribute — a list's
 * own "create a new one" entry — takes the neutral mark rather than being
 * dressed in a colour that would claim a kind it does not have.
 */
export const SomethingThatIsNotAnAttribute: Story = {
  args: { name: 'Create a new attribute…', type: undefined },
};

/**
 * A name longer than the space it is given is clipped rather than allowed to
 * push the control it sits in wider than its container.
 */
export const ANameLongerThanTheSpace: Story = {
  args: {
    name: 'how_often_this_person_and_the_participant_speak_in_a_typical_month',
    type: 'ordinal',
  },
  render: (args) => (
    <div className="w-72">
      <AttributePill {...args} />
    </div>
  ),
};
