import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';

import type { VariableType } from '@codaco/protocol-validation';

import AttributePill from './AttributePill.tsx';

const EVERY_TYPE: readonly VariableType[] = [
  'boolean',
  'categorical',
  'datetime',
  'layout',
  'location',
  'number',
  'ordinal',
  'scalar',
  'text',
];

const meta = {
  title: 'Protocol Builder/Fields/Attribute pill',
  component: AttributePill,
  parameters: {
    docs: {
      description: {
        component:
          'One attribute, shown as the researcher’s name for it over the colour and icon of the kind of answer it holds — Architect’s own pill, the same shape, accent colours and type icons its codebook editor has used since it was written. The kind decides what can be asked about an attribute and what a rule can compare it against, so a list of three dozen is unreadable without it. It says nothing to a screen reader about the kind itself: where it renders inside a list row, that row’s accessible name has to be the attribute’s own name, so whoever renders the pill states the kind beside it.',
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
 * The nine kinds of answer the protocol schema defines, in the colours and
 * icons Architect has shown them in since its codebook editor was written — so
 * a researcher moving between the two apps reads one vocabulary.
 */
export const EveryKindOfAnswer: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-2 p-4">
      {EVERY_TYPE.map((type) => (
        <AttributePill key={type} name={type} type={type} />
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const backgrounds = new Set<string>();
    const icons = new Set<string>();

    for (const type of EVERY_TYPE) {
      const pill = await canvas.findByText(type);
      const root = pill.closest('data');
      if (!root) throw new Error(`The ${type} pill did not render.`);

      // What a researcher sees: the accent resolved to a real colour rather
      // than a token that never landed, and an icon file that actually
      // arrived — a missing asset decodes to a zero-width image.
      const background = getComputedStyle(root).backgroundColor;
      await expect(background).not.toBe('rgba(0, 0, 0, 0)');
      backgrounds.add(background);

      const icon = root.querySelector('img');
      if (!icon) throw new Error(`The ${type} pill rendered no icon.`);
      await expect(icon.complete).toBe(true);
      await expect(icon.naturalWidth).toBeGreaterThan(0);
      icons.add(icon.currentSrc || icon.src);
    }

    await expect(backgrounds.size).toBe(EVERY_TYPE.length);
    await expect(icons.size).toBe(EVERY_TYPE.length);
  },
};

/**
 * A row that stands for something other than a codebook attribute — a list's
 * own "create a new one" entry — takes Architect's fallback mark: charcoal and
 * a question mark, neither of which claims one of the nine kinds.
 */
export const SomethingThatIsNotAnAttribute: Story = {
  args: { name: 'Create a new attribute…', type: undefined },
};

/** The pill is exactly as wide as its name and icon need. */
export const ContentSized: Story = {
  args: { name: 'participant_neighbourhood', type: 'text' },
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
    <div className="w-72 p-4">
      <AttributePill {...args} />
    </div>
  ),
};
