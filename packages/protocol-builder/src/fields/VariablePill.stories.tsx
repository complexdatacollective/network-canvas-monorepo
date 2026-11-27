import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';

import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import {
  dynamicAttributePillName,
  VariableKindMark,
  VariablePill,
  type VariablePillKind,
  type VariablePillSize,
} from './VariablePill.tsx';

const EVERY_KIND: readonly VariablePillKind[] = [
  'boolean',
  'categorical',
  'datetime',
  'layout',
  'location',
  'number',
  'ordinal',
  'scalar',
  'text',
  'dynamic',
  'placeholder',
];

const SIZES: readonly VariablePillSize[] = ['lg', 'md', 'sm', 'inline'];

const meta = {
  title: 'Protocol Builder/Fields/Variable pill',
  component: VariablePill,
  parameters: {
    docs: {
      description: {
        component:
          'One attribute, drawn as its name beside the colour and mark of the kind of value that it holds. The same pill is used everywhere that the builder shows an attribute: the attribute pickers, the corner of a field in a form, rule summaries, Architect’s codebook, and inline in text, where it keeps the baseline of the text and does not change the height of the line. A dynamic attribute shows its values, such as “their / her / his”. `variablePillSpec` draws the same pill for the rich text editor.',
      },
    },
  },
  args: { name: 'nominated_early', kind: 'boolean' },
  tags: ['autodocs'],
} satisfies Meta<typeof VariablePill>;

export default meta;
type Story = StoryObj<typeof meta>;

/** One attribute, as it reads beside the control that holds it. */
export const OneAttribute: Story = {};

/**
 * The nine kinds of value that the protocol schema defines, plus a dynamic
 * attribute and a placeholder, each in its own colour and with its own mark.
 */
export const EveryKind: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-2 p-4">
      {EVERY_KIND.map((kind) => (
        <VariablePill key={kind} name={kind} kind={kind} size="md" />
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const backgrounds = new Set<string>();
    const icons = new Set<string>();

    for (const kind of EVERY_KIND) {
      const name = await canvas.findByText(kind);
      const root = name.closest('data');
      if (!root) throw new Error(`The ${kind} pill did not render.`);

      // What a researcher sees: the accent resolved to a real colour rather
      // than a token that never landed, and a mark that actually arrived —
      // a missing asset decodes to a zero-width image.
      const background = getComputedStyle(root).backgroundColor;
      await expect(background).not.toBe('rgba(0, 0, 0, 0)');
      backgrounds.add(background);

      const icon = root.querySelector('img');
      if (!icon) throw new Error(`The ${kind} pill rendered no mark.`);
      await expect(icon.complete).toBe(true);
      await expect(icon.naturalWidth).toBeGreaterThan(0);
      icons.add(icon.currentSrc || icon.src);
    }

    await expect(backgrounds.size).toBe(EVERY_KIND.length);
    await expect(icons.size).toBe(EVERY_KIND.length);
  },
};

/** Each size, from Architect's codebook down to a pill in a line of text. */
export const Sizes: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-3 p-4">
      {SIZES.map((size) => (
        <VariablePill
          key={size}
          name={`size_${size}`}
          kind="text"
          size={size}
        />
      ))}
    </div>
  ),
};

/**
 * A dynamic attribute shows its values, in the navy of dynamic attributes,
 * ending in an ellipsis when they are long.
 */
export const DynamicAttributes: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-2 p-4">
      <VariablePill
        name={dynamicAttributePillName(['their', 'her', 'his'])}
        kind="dynamic"
        size="md"
      />
      <VariablePill
        name={dynamicAttributePillName([
          'partner',
          'friend',
          'colleague',
          'neighbour',
        ])}
        kind="dynamic"
        size="md"
      />
    </div>
  ),
};

/**
 * Neither a kind nor an attribute yet: the corner of a field whose attribute
 * has not been chosen.
 */
export const ChooseAnAttribute: Story = {
  args: {
    name: 'Choose an attribute',
    kind: undefined,
    dashed: true,
    size: 'sm',
  },
};

/**
 * An attribute that a reference still names but that the codebook no longer
 * describes, in the destructive accent, so that "we do not know what kind of
 * value this is" and "this attribute is gone" do not look the same.
 */
export const NoLongerInTheCodebook: Story = {
  args: { name: 'closeness', kind: undefined, missing: true },
  play: async ({ canvasElement }) => {
    const pill = canvasElement.querySelector('data');
    if (!pill) throw new Error('The pill did not render.');

    const missing = getComputedStyle(pill).backgroundColor;
    await expect(missing).not.toBe('rgba(0, 0, 0, 0)');

    const neutral = document.createElement('div');
    neutral.style.backgroundColor = 'oklch(var(--charcoal))';
    canvasElement.append(neutral);
    await expect(missing).not.toBe(getComputedStyle(neutral).backgroundColor);
    neutral.remove();
  },
};

/**
 * A name longer than the space that it is given is cut short with an
 * ellipsis, rather than pushing its container wider.
 */
export const ANameLongerThanTheSpace: Story = {
  args: {
    name: 'how_often_this_person_and_the_participant_speak_in_a_typical_month',
    kind: 'ordinal',
  },
  render: (args) => (
    <div className="w-72 p-4">
      <VariablePill {...args} />
    </div>
  ),
};

/** The small mark that names a kind where a whole pill would be too much. */
export const KindMarks: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-2 p-4">
      {EVERY_KIND.map((kind) => (
        <span key={kind} className="flex items-center gap-2 text-sm">
          <VariableKindMark kind={kind} />
          {kind}
        </span>
      ))}
    </div>
  ),
};

/** The lines that the line-height check compares, for one text style. */
function LinePair({ level }: Readonly<{ level: 'h1' | 'h2' | 'paragraph' }>) {
  const withPill = (
    <>
      About <VariablePill name="name" kind="text" size="inline" describeKind />{' '}
      and{' '}
      <VariablePill
        name="their / her / his"
        kind="dynamic"
        size="inline"
        describeKind
      />{' '}
      work
    </>
  );
  const plain = <>About name and their / her / his work</>;
  if (level === 'paragraph') {
    return (
      <div className="flex flex-col gap-2" data-level={level}>
        <Paragraph className="whitespace-nowrap" data-line="pill">
          {withPill}
        </Paragraph>
        <Paragraph className="whitespace-nowrap" data-line="plain">
          {plain}
        </Paragraph>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2" data-level={level}>
      <Heading
        level={level}
        margin="none"
        className="whitespace-nowrap"
        data-line="pill"
      >
        {withPill}
      </Heading>
      <Heading
        level={level}
        margin="none"
        className="whitespace-nowrap"
        data-line="plain"
      >
        {plain}
      </Heading>
    </div>
  );
}

const LEVELS = ['h1', 'h2', 'paragraph'] as const;

/**
 * Inline pills keep the baseline of the text and do not change the height of
 * the line that they sit in: a line holding pills is exactly as tall as the
 * same line without them, at heading and paragraph sizes.
 */
export const InlineKeepsTheLineHeight: Story = {
  render: () => (
    <div className="flex max-w-2xl flex-col gap-6 p-4">
      {LEVELS.map((level) => (
        <LinePair key={level} level={level} />
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    for (const level of LEVELS) {
      const pair = canvasElement.querySelector(`[data-level="${level}"]`);
      const withPill = pair?.querySelector<HTMLElement>('[data-line="pill"]');
      const plain = pair?.querySelector<HTMLElement>('[data-line="plain"]');
      if (!withPill || !plain) throw new Error(`No ${level} lines rendered.`);

      // One line each (the lines do not wrap), so that the comparison is of
      // one line box.
      const lineHeight = Number.parseFloat(getComputedStyle(plain).lineHeight);
      await expect(plain.getBoundingClientRect().height).toBeCloseTo(
        lineHeight,
        0,
      );
      await expect(withPill.getBoundingClientRect().height).toBeCloseTo(
        plain.getBoundingClientRect().height,
        1,
      );

      // The pill stays inside the line box rather than overhanging it.
      const pill = withPill.querySelector('data');
      if (!pill) throw new Error(`No ${level} pill rendered.`);
      const pillBox = pill.getBoundingClientRect();
      const lineBox = withPill.getBoundingClientRect();
      await expect(pillBox.top).toBeGreaterThanOrEqual(lineBox.top);
      await expect(pillBox.bottom).toBeLessThanOrEqual(lineBox.bottom);

      // Its name rests on the baseline of the words beside it: a zero-height
      // inline block sits on the baseline of the text that contains it, so
      // one in the line and one in the pill's name end at the same height.
      const marker = () => {
        const element = document.createElement('span');
        element.style.display = 'inline-block';
        element.style.height = '0';
        element.style.width = '0';
        return element;
      };
      const lineMarker = marker();
      withPill.prepend(lineMarker);
      const nameMarker = marker();
      pill.querySelector('[dir="auto"]')?.append(nameMarker);
      await expect(nameMarker.getBoundingClientRect().top).toBeCloseTo(
        lineMarker.getBoundingClientRect().top,
        0,
      );
      lineMarker.remove();
      nameMarker.remove();
    }
  },
};
