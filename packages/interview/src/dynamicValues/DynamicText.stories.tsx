import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';

import Heading from '@codaco/fresco-ui/typography/Heading';

import { DynamicMarkdown, DynamicTextParts } from './DynamicText';
import type { DynamicTextPart } from './resolveDynamicText';

/**
 * Values the interview fills into a study's own text, such as a name the
 * participant gave earlier. Each value is marked out with a dashed outline
 * and announced to screen readers as a dynamic value. The parts below are
 * what `resolveDynamicText` returns for a message and its values.
 */
const meta: Meta = {
  title: 'Components/DynamicValues',
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof meta>;

const greeting: DynamicTextPart[] = [
  'Thanks for **joining**, ',
  { name: 'name', text: 'Ada' },
  '. You told us you live in ',
  { name: 'city', text: 'Chicago' },
  '.',
];

export const InMarkdown: Story = {
  render: () => <DynamicMarkdown parts={greeting} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText('joining').tagName).toBe('STRONG');
    await expect(
      canvas.getByText('Dynamic value: Ada', { exact: false }),
    ).toBeInTheDocument();
  },
};

export const InAHeading: Story = {
  render: () => (
    <Heading level="h1">
      <DynamicTextParts
        parts={['Welcome, ', { name: 'name', text: 'Ada Lovelace' }]}
      />
    </Heading>
  ),
};

/** The version written for a missing value has nothing to mark out. */
export const MissingValue: Story = {
  render: () => <DynamicMarkdown parts={['Thanks for **joining**.']} />,
};

/** A long value wraps with the sentence, its outline broken at each line. */
export const LongValue: Story = {
  render: () => (
    <div style={{ maxWidth: '24rem' }}>
      <DynamicMarkdown
        parts={[
          'You named ',
          {
            name: 'place',
            text: 'the community garden behind the old library on Maple Street',
          },
          ' as a place you meet people.',
        ]}
      />
    </div>
  ),
};

/** Text that looks like markdown or HTML stays text inside a value. */
export const MarkupInAValue: Story = {
  render: () => (
    <DynamicMarkdown
      parts={[
        'Welcome, ',
        {
          name: 'name',
          text: '**bold** [link](https://example.com) <img src=x>',
        },
        '.',
      ]}
    />
  ),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('strong')).toBeNull();
    await expect(canvasElement.querySelector('a')).toBeNull();
    await expect(canvasElement.querySelector('img')).toBeNull();
  },
};

/**
 * A right-to-left value in a left-to-right sentence, and the reverse. Each
 * value is isolated, so the words around it keep their order.
 */
export const MixedDirection: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <DynamicMarkdown
        parts={['You named ', { name: 'name', text: 'מרים כהן' }, ' first.']}
      />
      <div dir="rtl" lang="ar">
        <DynamicMarkdown
          parts={['شكرًا لك، ', { name: 'name', text: 'Ada Lovelace' }, '.']}
        />
      </div>
    </div>
  ),
};
