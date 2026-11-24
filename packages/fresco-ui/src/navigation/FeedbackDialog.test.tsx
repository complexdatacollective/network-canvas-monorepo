import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { withSafeTypingIntoRichText } from '../testing/withSafeTypingIntoRichText';
import FeedbackDialog, { type FeedbackResponse } from './FeedbackDialog';

const TITLE = 'Share feedback';
const THANKS = 'Thanks for your feedback. It has been sent to our team.';

function setup() {
  return withSafeTypingIntoRichText(userEvent.setup());
}

async function openForm(user: ReturnType<typeof setup>) {
  await user.click(screen.getByRole('button', { name: 'Feedback' }));
  await screen.findByRole('dialog', { name: TITLE });
  return screen.findByRole('textbox', { name: 'Your feedback' });
}

const sendButton = () =>
  screen.getByRole('button', { name: 'Send to our team' });
const emailBox = () => screen.getByRole('textbox', { name: /^Email/ });

describe('FeedbackDialog', () => {
  it('opens a dialog with the feedback box focused', async () => {
    const user = setup();
    const onShown = vi.fn();
    render(<FeedbackDialog onSubmit={vi.fn()} onShown={onShown} />);

    expect(onShown).not.toHaveBeenCalled();
    const box = await openForm(user);

    await waitFor(() => expect(box).toHaveFocus());
    expect(onShown).toHaveBeenCalledOnce();
  });

  it('switches between sending privately and posting on the forum', async () => {
    const user = setup();
    render(<FeedbackDialog onSubmit={vi.fn()} />);

    await openForm(user);
    expect(
      screen.getByRole('dialog', { name: TITLE }),
    ).toHaveAccessibleDescription(/^Send it privately to our team/);
    expect(
      screen.getByRole('link', { name: 'community forum' }),
    ).toHaveAttribute('href', 'https://community.networkcanvas.com/');
    expect(
      screen.getByRole('link', { name: 'community forum' }),
    ).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('button', { name: /Our team/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      screen.queryByRole('radio', { name: 'Help & Support' }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Community forum/ }));
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(
      screen.getByRole('radio', { name: 'Feedback & Feature Requests' }),
    ).toBeChecked();
    expect(
      screen.getByText('Suggestions for improving the software.'),
    ).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Your post' })).toBeVisible();
    expect(
      screen.queryByRole('textbox', { name: /^Email/ }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Our team/ }));
    expect(
      screen.getByRole('textbox', { name: 'Your feedback' }),
    ).toBeVisible();
    expect(screen.getByRole('textbox', { name: /^Email/ })).toBeVisible();
  });

  it('hands the feedback to the forum instead, in the section chosen', async () => {
    const user = setup();
    const onSubmit = vi.fn();
    render(<FeedbackDialog onSubmit={onSubmit} />);

    const box = await openForm(user);
    await user.click(screen.getByRole('button', { name: /Community forum/ }));

    expect(
      screen.queryByRole('textbox', { name: /^Email/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Continue on the forum' }),
    ).toBeDisabled();

    await user.type(
      screen.getByRole('textbox', { name: 'Post title' }),
      ' Export fails ',
    );
    await user.type(box, 'It stops & says nothing.');
    const forum = () =>
      screen.getByRole('link', { name: 'Continue on the forum' });
    let url = new URL(forum().getAttribute('href') ?? '');
    expect(url.origin + url.pathname).toBe(
      'https://community.networkcanvas.com/new-topic',
    );
    expect(url.searchParams.get('category')).toBe(
      'feedback-and-feature-requests',
    );
    expect(url.searchParams.get('title')).toBe('Export fails');
    expect(url.searchParams.get('body')).toBe('It stops & says nothing.');
    expect(forum()).toHaveAttribute('target', '_blank');
    expect(screen.getByText(/for Feedback & Feature Requests\./)).toBeVisible();

    await user.click(screen.getByRole('radio', { name: 'Help & Support' }));
    url = new URL(forum().getAttribute('href') ?? '');
    expect(url.searchParams.get('category')).toBe('help-support');
    expect(screen.getByText(/for Help & Support\./)).toBeVisible();

    await user.click(
      screen.getByRole('radio', { name: 'General Conversation' }),
    );
    url = new URL(forum().getAttribute('href') ?? '');
    expect(url.searchParams.get('category')).toBe('general');

    // The form stays as it is, so the draft can be opened again after the
    // forum asks the person to sign in.
    forum().addEventListener('click', (event) => event.preventDefault());
    await user.click(forum());
    expect(forum()).toHaveAttribute('href', url.toString());
    expect(
      screen.getByRole('textbox', { name: 'Your post' }),
    ).toHaveTextContent('It stops & says nothing.');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('sends nothing while the feedback is empty', async () => {
    const user = setup();
    const onSubmit = vi.fn();
    render(<FeedbackDialog onSubmit={onSubmit} />);

    await user.type(await openForm(user), '   ');

    expect(sendButton()).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('sends the feedback alone, then moves focus to the thanks', async () => {
    const user = setup();
    const onSubmit = vi.fn<(response: FeedbackResponse) => void>();
    render(<FeedbackDialog onSubmit={onSubmit} />);

    await user.type(await openForm(user), 'Add a dark theme.');
    await user.click(sendButton());

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({
      feedback: 'Add a dark theme.',
    });
    expect(await screen.findByText(THANKS)).toHaveFocus();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('sends the email left for a reply', async () => {
    const user = setup();
    const onSubmit = vi.fn<(response: FeedbackResponse) => void>();
    render(<FeedbackDialog onSubmit={onSubmit} />);

    await user.type(await openForm(user), 'Add a dark theme.');
    await user.type(emailBox(), ' someone@example.org ');
    await user.click(sendButton());

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({
      feedback: 'Add a dark theme.',
      email: 'someone@example.org',
    });
  });

  it('refuses an email that is not an address, and says so', async () => {
    const user = setup();
    const onSubmit = vi.fn();
    render(<FeedbackDialog onSubmit={onSubmit} />);

    await user.type(await openForm(user), 'Add a dark theme.');
    await user.type(emailBox(), 'not-an-address');
    await user.click(sendButton());

    expect(onSubmit).not.toHaveBeenCalled();
    expect(
      await screen.findByText('Enter a valid email address.'),
    ).toBeInTheDocument();
  });

  it('refuses feedback longer than the host allows, and says so', async () => {
    const user = setup();
    const onSubmit = vi.fn();
    render(<FeedbackDialog onSubmit={onSubmit} maxLength={5} />);

    await user.type(await openForm(user), 'Too long');
    await user.click(sendButton());

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Enter at most 5 characters.')).toBeInTheDocument();
  });

  it('keeps what was written when sending fails, and sends it on another try', async () => {
    const user = setup();
    const onSubmit = vi
      .fn<(response: FeedbackResponse) => Promise<void>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce();
    render(<FeedbackDialog onSubmit={onSubmit} />);

    const box = await openForm(user);
    await user.type(box, 'Add a dark theme.');
    await user.click(sendButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'An error occurred while submitting the form.',
    );
    expect(box).toHaveTextContent('Add a dark theme.');

    await user.click(sendButton());

    expect(await screen.findByText(THANKS)).toHaveFocus();
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it('does not send twice while a send is still under way', async () => {
    const user = setup();
    let finish = () => {};
    const onSubmit = vi.fn(
      () => new Promise<void>((resolve) => (finish = resolve)),
    );
    render(<FeedbackDialog onSubmit={onSubmit} />);

    await user.type(await openForm(user), 'Add a dark theme.');
    await user.click(sendButton());
    expect(sendButton()).toBeDisabled();
    await user.click(sendButton());
    expect(onSubmit).toHaveBeenCalledOnce();

    finish();
    expect(await screen.findByText(THANKS)).toBeVisible();
  });

  it('keeps an unsent draft when closed and reopened', async () => {
    const user = setup();
    render(<FeedbackDialog onSubmit={vi.fn()} />);

    await user.type(await openForm(user), 'Half a thought');
    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    expect(await openForm(user)).toHaveTextContent('Half a thought');
  });

  it('starts again with an empty form the next time it opens', async () => {
    const user = setup();
    const onShown = vi.fn();
    render(<FeedbackDialog onSubmit={vi.fn()} onShown={onShown} />);

    await user.type(await openForm(user), 'Add a dark theme.');
    await user.type(emailBox(), 'someone@example.org');
    await user.click(sendButton());
    await screen.findByText(THANKS);
    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    expect(await openForm(user)).toHaveTextContent('');
    expect(emailBox()).toHaveValue('');
    expect(onShown).toHaveBeenCalledTimes(2);
  });

  it('names an icon-only trigger in English', () => {
    render(<FeedbackDialog onSubmit={vi.fn()} display="icon" />);

    const trigger = screen.getByRole('button', { name: 'Feedback' });
    expect(trigger).toHaveAttribute('lang', 'en');
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
  });

  it('renders the host’s own trigger with the icon and label inside it', () => {
    render(
      <FeedbackDialog
        onSubmit={vi.fn()}
        // Named by the label the dialog puts inside it.
        // oxlint-disable-next-line jsx-a11y/control-has-associated-label
        renderTrigger={<button type="button" className="underline" />}
      />,
    );

    const trigger = screen.getByRole('button', { name: 'Feedback' });
    expect(trigger).toHaveClass('underline');
    expect(
      trigger.querySelector('.lucide-message-square-text'),
    ).toBeInTheDocument();
  });
});
