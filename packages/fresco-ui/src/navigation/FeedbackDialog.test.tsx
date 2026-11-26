import { Toast } from '@base-ui/react/toast';
import {
  fireEvent,
  render as renderUnwrapped,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { withSafeTypingIntoRichText } from '../testing/withSafeTypingIntoRichText';
import { Toaster } from '../Toast';
import { FORUM_TOPIC_URL_MAX_LENGTH, forumTopicUrl } from './communityForum';
import FeedbackDialog, {
  FeedbackFormScope,
  type FeedbackResponse,
} from './FeedbackDialog';

const TITLE = 'Share feedback';
const THANKS = 'Thanks for your feedback. It has been sent to our team.';
const DESCRIPTION =
  'This project depends on ideas and feedback from our users. If you have a suggestion for how the software could be improved, please share it with us. Thank you for your time!';
const AUDIENCE_HINT =
  'Post on the community forum to report a problem, suggest an idea, or get help from other researchers. If you’d rather not post publicly, you can send your feedback privately to our team instead. The forum opens in a new tab with a draft of your post. Posting it needs a forum account.';
const TOO_LONG_FOR_FORUM =
  'Your post is too long to send to the forum. Shorten it, or send it privately to our team instead.';
const EMAIL_HINT =
  'If you would like us to contact you about your feedback, please provide your email address. Anonymous feedback is also welcome.';

/** Renders inside a toast provider, as every host does. */
function renderOnPage(ui: ReactElement) {
  return renderUnwrapped(
    <Toast.Provider>
      {ui}
      <Toaster />
    </Toast.Provider>,
  );
}

/** Renders with a form of its own, so tests do not share a draft. */
function render(ui: ReactElement) {
  return renderOnPage(<FeedbackFormScope>{ui}</FeedbackFormScope>);
}

/** The thanks, shown as a notification once the dialog has closed. */
async function expectThanksAfterClosing() {
  const notifications = await screen.findByRole('region', {
    name: 'Notifications',
  });
  expect(
    await within(notifications).findByRole('heading', { name: THANKS }),
  ).toBeInTheDocument();
  await waitFor(() =>
    expect(
      screen.queryByRole('dialog', { name: TITLE }),
    ).not.toBeInTheDocument(),
  );
}

function setup() {
  return withSafeTypingIntoRichText(userEvent.setup());
}

/** Opens the dialog, which starts on the community forum. */
async function openDialog(user: ReturnType<typeof setup>) {
  await user.click(screen.getByRole('button', { name: 'Feedback' }));
  await screen.findByRole('dialog', { name: TITLE });
  return screen.findByRole('textbox', { name: /^Your (post|feedback)$/ });
}

/** Opens the dialog and switches it to sending privately to the team. */
async function openForm(user: ReturnType<typeof setup>) {
  await openDialog(user);
  await user.click(screen.getByRole('button', { name: /Our team/ }));
  return screen.findByRole('textbox', { name: 'Your feedback' });
}

const audienceSwitch = () =>
  screen.getByRole('group', { name: 'Who should see it?' });
const forumOption = () =>
  screen.getByRole('button', { name: /Community forum/ });

/** Pastes plain text into the rich-text box, faster than typing it. */
function pasteInto(box: HTMLElement, text: string) {
  fireEvent.focus(box);
  fireEvent.paste(box, {
    clipboardData: {
      getData: (type: string) => (type === 'text/plain' ? text : ''),
      types: ['text/plain'],
      files: [],
      items: [],
    } as unknown as DataTransfer,
  });
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
    const box = await openDialog(user);

    await waitFor(() => expect(box).toHaveFocus());
    expect(onShown).toHaveBeenCalledOnce();
  });

  it('switches between sending privately and posting on the forum', async () => {
    const user = setup();
    render(<FeedbackDialog onSubmit={vi.fn()} />);

    await openDialog(user);
    expect(
      screen.getByRole('dialog', { name: TITLE }),
    ).toHaveAccessibleDescription(DESCRIPTION);
    expect(forumOption()).toHaveAttribute('aria-pressed', 'true');
    expect(audienceSwitch()).toHaveAccessibleDescription(AUDIENCE_HINT);
    expect(
      screen.getByRole('link', { name: 'community forum' }),
    ).toHaveAttribute('href', 'https://community.networkcanvas.com/');
    expect(
      screen.getByRole('link', { name: 'community forum' }),
    ).toHaveAttribute('target', '_blank');
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Your post' })).toBeVisible();
    expect(
      screen.queryByRole('textbox', { name: /^Email/ }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Our team/ }));
    expect(
      screen.getByRole('textbox', { name: 'Your feedback' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('textbox', { name: 'Post title' }),
    ).not.toBeInTheDocument();
    // The hint stays the same whichever option is chosen.
    expect(audienceSwitch()).toHaveAccessibleDescription(AUDIENCE_HINT);
    expect(emailBox()).toBeVisible();
    expect(emailBox()).toHaveAccessibleName('Email');
    expect(emailBox()).toHaveAccessibleDescription(EMAIL_HINT);

    await user.click(forumOption());
    expect(screen.getByRole('textbox', { name: 'Your post' })).toBeVisible();
  });

  it('hands the feedback to the forum instead, in the feedback section', async () => {
    const user = setup();
    const onSubmit = vi.fn();
    render(<FeedbackDialog onSubmit={onSubmit} />);

    const box = await openDialog(user);

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
    const url = new URL(forum().getAttribute('href') ?? '');
    expect(url.origin + url.pathname).toBe(
      'https://community.networkcanvas.com/new-topic',
    );
    expect(url.searchParams.get('category')).toBe(
      'feedback-and-feature-requests',
    );
    expect(url.searchParams.get('title')).toBe('Export fails');
    expect(url.searchParams.get('body')).toBe('It stops & says nothing.');
    expect(forum()).toHaveAttribute('target', '_blank');

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

  it('refuses a forum post too long for the forum to open, and says so', async () => {
    const user = setup();
    const onSubmit = vi.fn<(response: FeedbackResponse) => void>();
    render(<FeedbackDialog onSubmit={onSubmit} maxLength={5000} />);

    // Well within maxLength, but every Arabic letter is six characters of
    // the encoded link.
    const post = 'مرحبا بكم'.repeat(200);
    expect(post.length).toBeLessThan(5000);
    expect(forumTopicUrl({ title: '', body: post }).length).toBeGreaterThan(
      FORUM_TOPIC_URL_MAX_LENGTH,
    );

    const box = await openDialog(user);
    pasteInto(box, post);

    expect(await screen.findByText(TOO_LONG_FOR_FORUM)).toBeVisible();
    expect(
      screen.queryByRole('link', { name: 'Continue on the forum' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Continue on the forum' }),
    ).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /Our team/ }));
    expect(screen.queryByText(TOO_LONG_FOR_FORUM)).not.toBeInTheDocument();
    expect(sendButton()).toBeEnabled();
    await user.click(sendButton());

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({ feedback: post });
  });

  it('opens a forum post in a non-Latin script that fits the forum link', async () => {
    const user = setup();
    render(<FeedbackDialog onSubmit={vi.fn()} maxLength={5000} />);

    const post = 'مرحبا بكم'.repeat(100);
    expect(forumTopicUrl({ title: '', body: post }).length).toBeLessThan(
      FORUM_TOPIC_URL_MAX_LENGTH,
    );

    pasteInto(await openDialog(user), post);

    const forum = await screen.findByRole('link', {
      name: 'Continue on the forum',
    });
    expect(
      new URL(forum.getAttribute('href') ?? '').searchParams.get('body'),
    ).toBe(post);
    expect(screen.queryByText(TOO_LONG_FOR_FORUM)).not.toBeInTheDocument();
  });

  it('sends nothing while the feedback is empty', async () => {
    const user = setup();
    const onSubmit = vi.fn();
    render(<FeedbackDialog onSubmit={onSubmit} />);

    await user.type(await openForm(user), '   ');

    expect(sendButton()).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('sends the feedback alone, then closes and says thanks', async () => {
    const user = setup();
    const onSubmit = vi.fn<(response: FeedbackResponse) => void>();
    render(<FeedbackDialog onSubmit={onSubmit} />);

    await user.type(await openForm(user), 'Add a dark theme.');
    await user.click(sendButton());

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({
      feedback: 'Add a dark theme.',
    });
    await expectThanksAfterClosing();
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
    expect(screen.getByRole('dialog', { name: TITLE })).toBeVisible();
    expect(box).toHaveTextContent('Add a dark theme.');
    expect(screen.queryByText(THANKS)).not.toBeInTheDocument();

    await user.click(sendButton());

    await expectThanksAfterClosing();
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
    await expectThanksAfterClosing();
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

  // A host may render a control in a drawer that unmounts when it closes, and
  // another for a different screen width. The draft is the page's, so none of
  // them takes it away, and every one opens it.
  it('keeps one draft for the page, across controls and after one unmounts', async () => {
    const user = setup();
    const onSubmit = vi.fn();
    const view = renderOnPage(
      <FeedbackDialog
        onSubmit={onSubmit}
        // oxlint-disable-next-line jsx-a11y/control-has-associated-label
        renderTrigger={<button type="button" data-testid="in-drawer" />}
      />,
    );

    await user.type(await openForm(user), 'Half a thought');
    await user.type(emailBox(), 'someone@example.org');
    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    view.unmount();

    renderOnPage(<FeedbackDialog onSubmit={onSubmit} />);
    await openDialog(user);
    expect(
      screen.getByRole('textbox', { name: 'Your feedback' }),
    ).toHaveTextContent('Half a thought');
    expect(emailBox()).toHaveValue('someone@example.org');

    // Sending empties the page's form, for the next test as for the person.
    await user.click(sendButton());
    await expectThanksAfterClosing();
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({
      feedback: 'Half a thought',
      email: 'someone@example.org',
    });
    await openForm(user);
    expect(
      screen.getByRole('textbox', { name: 'Your feedback' }),
    ).toHaveTextContent('');
  });

  it('starts again with an empty form the next time it opens', async () => {
    const user = setup();
    const onShown = vi.fn();
    render(<FeedbackDialog onSubmit={vi.fn()} onShown={onShown} />);

    await user.type(await openForm(user), 'Add a dark theme.');
    await user.type(emailBox(), 'someone@example.org');
    await user.click(sendButton());
    await expectThanksAfterClosing();

    await openDialog(user);
    expect(forumOption()).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: /Our team/ }));
    expect(
      await screen.findByRole('textbox', { name: 'Your feedback' }),
    ).toHaveTextContent('');
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
