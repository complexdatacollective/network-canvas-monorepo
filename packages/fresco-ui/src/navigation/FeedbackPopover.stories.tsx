import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, screen, userEvent, waitFor } from 'storybook/test';

import FeedbackPopover from './FeedbackPopover';

const documentation = `
The feedback control shared by Architect, Interviewer and Fresco: a quiet
button that opens one question, "How could we improve this app?", over a text
box. Sending replaces the form with a line of thanks; the next opening starts
with an empty form. Hosts own where the answer goes; the copy is shared and
translated once.

\`\`\`tsx
import FeedbackPopover from '@codaco/fresco-ui/navigation/FeedbackPopover';
import { appFeedbackSurvey } from '@codaco/shared-consts';

<FeedbackPopover {...appFeedbackSurvey(capture)} />
\`\`\`

- **\`onSubmit\`** — called with the trimmed text when the user sends it.
  Send is disabled while the box is empty.
- **\`onShown\`** — called each time the form opens.
- **\`maxLength\`** — the most text the box accepts.
- **\`display\`** — \`label\` (the default) shows "Feedback" beside the icon;
  \`icon\` renders an \`IconButton\` named "Feedback".
- **\`variant\`** / **\`color\`** / **\`size\`** / **\`className\`** — the
  trigger's \`Button\` look, so it matches the controls beside it. Defaults to
  a \`text\` button in \`color="dynamic"\`, which takes the colour of the bar
  it sits on.
- **\`renderTrigger\`** — an element to render the trigger as instead of that
  \`Button\`, for a host whose bar dresses its own controls. The icon, and the
  label unless \`display\` is \`icon\`, are its children.
- **\`side\`** / **\`align\`** — where the popover opens. An arrow points back
  at the trigger.
`;

const meta = {
  title: 'Navigation/FeedbackPopover',
  component: FeedbackPopover,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: { description: { component: documentation } },
  },
  argTypes: {
    display: { control: 'radio', options: ['label', 'icon'] },
    variant: {
      control: 'select',
      options: ['default', 'outline', 'text', 'glass'],
    },
    color: {
      control: 'select',
      options: ['default', 'dynamic', 'primary', 'secondary'],
    },
    size: { control: 'radio', options: ['sm', 'md', 'lg'] },
    side: { control: 'radio', options: ['top', 'bottom'] },
    align: { control: 'radio', options: ['start', 'center', 'end'] },
    renderTrigger: { control: false },
  },
  args: {
    onSubmit: fn(),
    onShown: fn(),
    maxLength: 2000,
  },
} satisfies Meta<typeof FeedbackPopover>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const IconOnly: Story = {
  args: { display: 'icon' },
};

export const Open: Story = {
  args: { defaultOpen: true },
};

/** A host's own navigation item as the trigger. */
export const HostTrigger: Story = {
  args: {
    renderTrigger: (
      // Named by the popover, which puts the label inside it.
      // oxlint-disable-next-line jsx-a11y/control-has-associated-label
      <button
        type="button"
        className="focusable hover:text-accent inline-flex cursor-pointer items-center gap-2 font-semibold [&>.lucide]:size-4"
      />
    ),
  },
};

export const SendsFeedback: Story = {
  play: async ({ args, canvas, step }) => {
    await step('Open the form', async () => {
      await userEvent.click(canvas.getByRole('button', { name: 'Feedback' }));
      await expect(args.onShown).toHaveBeenCalledOnce();
    });

    const box = await screen.findByRole('textbox', {
      name: 'How could we improve this app?',
    });
    const send = screen.getByRole('button', { name: 'Send' });

    await step('Send is disabled until something is written', async () => {
      await expect(send).toBeDisabled();
      await userEvent.type(box, 'Add a dark theme.');
      await expect(send).toBeEnabled();
    });

    await step('Sending replaces the form with the thanks', async () => {
      await userEvent.click(send);
      await expect(args.onSubmit).toHaveBeenCalledOnce();
      await expect(args.onSubmit).toHaveBeenCalledWith('Add a dark theme.');
      await waitFor(() =>
        expect(screen.getByText('Thanks for your feedback.')).toHaveFocus(),
      );
    });
  },
};
