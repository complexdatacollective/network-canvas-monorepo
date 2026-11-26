import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, screen, userEvent, waitFor } from 'storybook/test';

import { withToastProvider } from '../storybook-support/withToastProvider';
import FeedbackDialog, { FeedbackFormScope } from './FeedbackDialog';

const documentation = `
The feedback control shared by Architect, Interviewer and Fresco: a button
that opens a dialog where the person chooses who should see their feedback.

- **Community forum** (the default) asks for a title, and opens the forum's
  new-topic composer in a new tab, in the Feedback & Feature Requests section
  with the post filled in, for the person to post under their own account.
  Nothing goes through \`onSubmit\`. The forum cannot open a link longer
  than about 8,000 characters, so a post too long for one shows an error in
  place of the link. Text in a non-Latin script, such as Arabic or Chinese,
  reaches that limit sooner, because each of its characters takes six or more
  characters of the link.
- **Our team** sends it privately through \`onSubmit\`, with an optional email
  for a reply. Once it has been sent, the dialog closes and a notification
  thanks the person.

The text box takes lists and bold or italic text, sent as markdown. The next
opening after a send starts with an empty form. The notification needs the
host's \`Toast.Provider\` and \`Toaster\`, which Architect, Interviewer and
Fresco render at their roots. Hosts own where a private response goes; the copy
is shared and translated once.

\`\`\`tsx
import FeedbackDialog from '@codaco/fresco-ui/navigation/FeedbackDialog';
import { appFeedbackSurvey } from '@codaco/shared-consts';

<FeedbackDialog {...appFeedbackSurvey(capture)} />
\`\`\`

- **\`onSubmit\`** — called with \`{ feedback, email? }\` when the user sends
  it privately: the feedback as markdown, and the address if one was left.
  Send is disabled while the feedback is empty. A returned promise is awaited: if it
  rejects, the form stays with what the user wrote, under a line saying it
  could not be sent.
- **\`onShown\`** — called each time the dialog opens.
- **\`maxLength\`** — the most characters the feedback may run to, as markdown.
- **\`display\`** — \`label\` (the default) shows "Feedback" beside the icon;
  \`icon\` renders an \`IconButton\` named "Feedback", with a tooltip.
- **\`variant\`** / **\`color\`** / **\`size\`** / **\`className\`** — the
  trigger's \`Button\` look, so it matches the controls beside it.
- **\`renderTrigger\`** — an element to render the trigger as instead of that
  \`Button\`, for a host whose bar dresses its own controls. The icon, and the
  label unless \`display\` is \`icon\`, are its children.
`;

const meta = {
  title: 'Navigation/FeedbackDialog',
  component: FeedbackDialog,
  tags: ['autodocs'],
  decorators: [
    withToastProvider,
    // Each story has its own form, rather than the one every Feedback control
    // on a page shares.
    (Story) => (
      <FeedbackFormScope>
        <Story />
      </FeedbackFormScope>
    ),
  ],
  parameters: {
    layout: 'centered',
    docs: { description: { component: documentation } },
  },
  argTypes: {
    display: { control: 'radio', options: ['label', 'icon'] },
    variant: {
      control: 'select',
      options: ['default', 'raised', 'text', 'glass'],
    },
    color: {
      control: 'select',
      options: ['default', 'dynamic', 'primary', 'secondary'],
    },
    size: { control: 'radio', options: ['sm', 'md', 'lg'] },
    renderTrigger: { control: false },
  },
  args: {
    onSubmit: fn(),
    onShown: fn(),
    maxLength: 5000,
  },
} satisfies Meta<typeof FeedbackDialog>;

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
      // Named by the label the dialog puts inside it.
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
    await step('Open the dialog', async () => {
      await userEvent.click(canvas.getByRole('button', { name: 'Feedback' }));
      await expect(args.onShown).toHaveBeenCalledOnce();
    });

    await step('Switch to sending it privately', async () => {
      await userEvent.click(
        await screen.findByRole('button', { name: /Our team/ }),
      );
    });

    const box = await screen.findByRole('textbox', { name: 'Your feedback' });
    const send = screen.getByRole('button', { name: 'Send to our team' });

    await step('Send is disabled until something is written', async () => {
      await expect(send).toBeDisabled();
      await userEvent.click(box);
      await userEvent.keyboard('Add a dark theme.');
      await expect(send).toBeEnabled();
    });

    await step('Sending closes the dialog and says thanks', async () => {
      await userEvent.type(
        screen.getByRole('textbox', { name: /^Email/ }),
        'someone@example.org',
      );
      await userEvent.click(send);
      await expect(args.onSubmit).toHaveBeenCalledOnce();
      await expect(args.onSubmit).toHaveBeenCalledWith({
        feedback: 'Add a dark theme.',
        email: 'someone@example.org',
      });
      await expect(
        await screen.findByRole('heading', {
          name: 'Thanks for your feedback. It has been sent to our team.',
        }),
      ).toBeVisible();
      await waitFor(() =>
        expect(
          screen.queryByRole('dialog', { name: 'Share feedback' }),
        ).not.toBeInTheDocument(),
      );
    });

    await step('Opening it again starts with an empty form', async () => {
      await userEvent.click(canvas.getByRole('button', { name: 'Feedback' }));
      await userEvent.click(
        await screen.findByRole('button', { name: /Our team/ }),
      );
      await expect(
        await screen.findByRole('textbox', { name: 'Your feedback' }),
      ).toHaveTextContent('');
      await expect(screen.getByRole('textbox', { name: /^Email/ })).toHaveValue(
        '',
      );
    });
  },
};
