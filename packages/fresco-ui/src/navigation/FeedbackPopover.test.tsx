import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import FeedbackPopover from './FeedbackPopover';

const QUESTION = 'How could we improve this app?';

async function openForm() {
  await userEvent.click(screen.getByRole('button', { name: 'Feedback' }));
  return screen.findByRole('textbox', { name: QUESTION });
}

describe('FeedbackPopover', () => {
  it('opens the question over a text box named by it', async () => {
    const onShown = vi.fn();
    render(<FeedbackPopover onSubmit={vi.fn()} onShown={onShown} />);

    expect(onShown).not.toHaveBeenCalled();
    await openForm();

    expect(screen.getByRole('dialog', { name: QUESTION })).toBeInTheDocument();
    expect(onShown).toHaveBeenCalledOnce();
  });

  it('sends nothing while the box is empty or blank', async () => {
    const onSubmit = vi.fn();
    render(<FeedbackPopover onSubmit={onSubmit} />);

    const box = await openForm();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();

    await userEvent.type(box, '   {Enter}');
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('sends the trimmed text and moves focus to the thanks', async () => {
    const onSubmit = vi.fn();
    render(<FeedbackPopover onSubmit={onSubmit} />);

    await userEvent.type(await openForm(), '  Add a dark theme.  ');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith('Add a dark theme.');
    expect(await screen.findByText('Thanks for your feedback.')).toHaveFocus();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('keeps what was written when sending fails, and sends it on another try', async () => {
    const onSubmit = vi
      .fn<(feedback: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce();
    render(<FeedbackPopover onSubmit={onSubmit} />);

    const box = await openForm();
    await userEvent.type(box, 'Add a dark theme.');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'An error occurred while submitting the form.',
    );
    expect(box).toHaveValue('Add a dark theme.');
    expect(
      screen.queryByText('Thanks for your feedback.'),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('Thanks for your feedback.')).toHaveFocus();
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it('does not send twice while a send is still under way', async () => {
    let finish = () => {};
    const onSubmit = vi.fn(
      () => new Promise<void>((resolve) => (finish = resolve)),
    );
    render(<FeedbackPopover onSubmit={onSubmit} />);

    await userEvent.type(await openForm(), 'Add a dark theme.');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(onSubmit).toHaveBeenCalledOnce();

    finish();
    expect(await screen.findByText('Thanks for your feedback.')).toBeVisible();
  });

  // A send that outlives the popup must not land on a form the user has
  // since reopened and started again.
  it('keeps a send under way, and the draft, when closed and reopened', async () => {
    let finish = () => {};
    const onSubmit = vi.fn(
      () => new Promise<void>((resolve) => (finish = resolve)),
    );
    render(<FeedbackPopover onSubmit={onSubmit} />);

    await userEvent.type(await openForm(), 'Add a dark theme.');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    await userEvent.keyboard('{Escape}');

    expect(await openForm()).toHaveValue('Add a dark theme.');
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();

    finish();
    expect(await screen.findByText('Thanks for your feedback.')).toBeVisible();
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('keeps an unsent draft when closed and reopened', async () => {
    render(<FeedbackPopover onSubmit={vi.fn()} />);

    await userEvent.type(await openForm(), 'Half a thought');
    await userEvent.keyboard('{Escape}');

    expect(await openForm()).toHaveValue('Half a thought');
  });

  it('starts again with an empty form the next time it opens', async () => {
    const onShown = vi.fn();
    render(<FeedbackPopover onSubmit={vi.fn()} onShown={onShown} />);

    await userEvent.type(await openForm(), 'Add a dark theme.');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    await userEvent.keyboard('{Escape}');

    expect(await openForm()).toHaveValue('');
    expect(onShown).toHaveBeenCalledTimes(2);
  });

  it('limits the text to the length the host allows', async () => {
    render(<FeedbackPopover onSubmit={vi.fn()} maxLength={5} />);

    const box = await openForm();
    await userEvent.type(box, 'Too long');

    expect(box).toHaveValue('Too l');
  });

  it('names an icon-only trigger in English', () => {
    render(<FeedbackPopover onSubmit={vi.fn()} display="icon" />);

    const trigger = screen.getByRole('button', { name: 'Feedback' });
    expect(trigger).toHaveAttribute('lang', 'en');
    expect(trigger).toHaveTextContent('');
  });

  it('renders the host’s own trigger with the icon and label inside it', () => {
    render(
      <FeedbackPopover
        onSubmit={vi.fn()}
        // Named by the popover, which puts the label inside it.
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
