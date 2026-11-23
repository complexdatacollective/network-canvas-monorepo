import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';

import { ThemedRegion } from '@codaco/fresco-ui/ThemedRegion';
import Heading from '@codaco/fresco-ui/typography/Heading';

import { DynamicMarkdown, DynamicTextParts } from './DynamicText';
import type { DynamicTextPart } from './resolveDynamicText';

/**
 * Values the interview fills into a study's own text, such as a name the
 * participant gave earlier. Each value is marked out with a primary-colour tint
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
    await expect(canvas.getByText('Ada', { exact: false })).toBeInTheDocument();
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

const LONG_PLACE =
  'the community garden behind the old library on Maple Street';

/** A long value wraps with the sentence, its outline broken at each line. */
export const LongValue: Story = {
  render: () => (
    <div style={{ maxWidth: '24rem' }}>
      <DynamicMarkdown
        parts={[
          'You named ',
          {
            name: 'place',
            text: LONG_PLACE,
          },
          ' as a place you meet people.',
        ]}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const value = canvasElement.querySelector('[data-dynamic-value]');
    await expect(value).not.toBeNull();
    await expect(value?.querySelector('bdi')).toHaveTextContent(LONG_PLACE);
    await expect(canvasElement).toHaveTextContent(
      `You named ${LONG_PLACE} as a place you meet people.`,
    );
  },
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
      <div data-testid="ltr">
        <DynamicMarkdown
          parts={['You named ', { name: 'name', text: 'מרים כהן' }, ' first.']}
        />
      </div>
      <div dir="rtl" lang="ar" data-testid="rtl">
        <DynamicMarkdown
          parts={['شكرًا لك، ', { name: 'name', text: 'Ada Lovelace' }, '.']}
        />
      </div>
    </div>
  ),
  play: async ({ canvas, canvasElement }) => {
    const values = canvasElement.querySelectorAll('[data-dynamic-value]');
    await expect(values).toHaveLength(2);
    await expect(values[0]?.querySelector('bdi')).toHaveTextContent('מרים כהן');
    await expect(values[1]?.querySelector('bdi')).toHaveTextContent(
      'Ada Lovelace',
    );
    await expect(canvas.getByTestId('ltr')).toHaveTextContent(
      'You named מרים כהן first.',
    );
    await expect(canvas.getByTestId('rtl')).toHaveTextContent(
      'شكرًا لك، Ada Lovelace.',
    );
  },
};

/**
 * The resolved state in each theme region a story here can render in. The
 * interview theme is also the one every story already runs in.
 */
const THEMES = ['interview', 'studio'] as const;

export const ResolvedInEachTheme: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      {THEMES.map((theme) => (
        <ThemedRegion
          key={theme}
          theme={theme}
          data-testid={`theme-${theme}`}
          className="bg-background text-text rounded p-4"
        >
          <DynamicMarkdown parts={greeting} />
        </ThemedRegion>
      ))}
    </div>
  ),
  play: async ({ canvas }) => {
    for (const theme of THEMES) {
      const region = canvas.getByTestId(`theme-${theme}`);
      const value = region.querySelector('[data-dynamic-value]');
      await expect(value).not.toBeNull();
      await expect(value?.querySelector('bdi')).toHaveTextContent('Ada');
    }
  },
};
