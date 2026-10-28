import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';

import OptionLabel, { optionLabelText } from './OptionLabel';

const meta = {
  title: 'Components/OptionLabel',
  component: OptionLabel,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: `
The one way to show an authored option label. Option labels are markdown, and
the rich-text editor stores characters such as \`<\`, \`&\` and \`'\` escaped, so a
label must never be dropped into the page as plain text.

\`label\` is a string or a \`PresentationalText\` object; the object's \`lang\` and
\`dir\` are set on the rendered element. \`render\` is the element the label is
rendered into, a \`<span>\` by default. \`optionLabelText\` gives the same label as
plain text, for an \`aria-label\`, a \`title\`, a native \`<option>\` or a message.

\`\`\`tsx
import OptionLabel, { optionLabelText } from '@codaco/fresco-ui/OptionLabel';

<OptionLabel label={option.label} />
<OptionLabel label={option.label} render={<span className="text-sm" />} />
<button aria-label={optionLabelText(option.label)}>…</button>
\`\`\`

Props
- \`label\`: \`string | { text, lang, dir }\`, the markdown label.
- \`render\`: optional element to render the label into.
`,
      },
    },
  },
  argTypes: {
    label: { control: 'text' },
  },
  args: {
    label: '**Regularly** (3+ times/week)',
  },
} satisfies Meta<typeof OptionLabel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const strong = await canvas.findByText('Regularly');
    await expect(strong.tagName).toBe('STRONG');
    await expect(canvasElement).toHaveTextContent('Regularly (3+ times/week)');
    await expect(canvasElement.textContent).not.toContain('**');
  },
};

export const PlainText: Story = {
  args: { label: 'Weekly' },
  play: async ({ canvasElement }) => {
    await expect(canvasElement).toHaveTextContent('Weekly');
    await expect(canvasElement.querySelector('strong, em')).toBeNull();
  },
};

export const Emphasis: Story = {
  args: { label: '*Rarely* or _never_' },
  play: async ({ canvasElement }) => {
    const emphasis = [...canvasElement.querySelectorAll('em')].map(
      (element) => element.textContent,
    );
    await expect(emphasis).toEqual(['Rarely', 'never']);
    await expect(canvasElement).toHaveTextContent('Rarely or never');
  },
};

export const EscapedCharacters: Story = {
  args: { label: 'Sometimes (&lt;3 times/week) &amp; Don&#39;t know' },
  play: async ({ canvasElement }) => {
    await expect(canvasElement).toHaveTextContent(
      "Sometimes (<3 times/week) & Don't know",
    );
    await expect(canvasElement.textContent).not.toMatch(/&(lt|amp|#39);/);
  },
};

export const TranslatedRightToLeft: Story = {
  args: {
    label: { text: '**نعم**، أحياناً', lang: 'ar', dir: 'rtl' },
  },
  play: async ({ canvasElement }) => {
    const element = canvasElement.querySelector('[lang="ar"]');
    await expect(element).not.toBeNull();
    await expect(element).toHaveAttribute('dir', 'rtl');
    await expect(element?.querySelector('strong')).toHaveTextContent('نعم');
  },
};

export const CustomElement: Story = {
  args: {
    label: '**In person** or _by phone_',
    render: <p className="text-lg" data-testid="option-label" />,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const element = canvas.getByTestId('option-label');
    await expect(element.tagName).toBe('P');
    await expect(element).toHaveClass('text-lg');
    await expect(element).toHaveTextContent('In person or by phone');
  },
};

export const LongLabelInNarrowContainer: Story = {
  args: {
    label:
      '**Several times a week**, usually in person but sometimes by phone, video call &amp; text message',
    render: <span className="block" style={{ maxWidth: 200 }} />,
  },
};

export const PlainTextForAttributes: Story = {
  args: { label: '**In person** &amp; _by phone_' },
  render: ({ label }) => (
    <button type="button" aria-label={optionLabelText(label)}>
      <OptionLabel label={label} />
    </button>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('button', { name: 'In person & by phone' }),
    ).toBeInTheDocument();
  },
};
