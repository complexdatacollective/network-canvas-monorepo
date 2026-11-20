import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import messages from '../../messages/en.json';
import ArticleFeedback from '../ArticleFeedback';

const { capture } = vi.hoisted(() => ({ capture: vi.fn() }));

vi.mock('posthog-js', () => {
  const posthog = { capture, __loaded: true };
  return { default: posthog, posthog };
});

const RATING = '$survey_response_c5b666c2-1e43-4ff8-b212-ea3b3bd327ae';
const COMMENT = '$survey_response_220d2d7a-3cb1-4061-9c03-dc02ff1b44e4';

function renderFeedback() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ArticleFeedback docPath="/get-started/glossary" />
    </NextIntlClientProvider>,
  );
}

describe('ArticleFeedback', () => {
  beforeEach(() => {
    capture.mockClear();
  });

  afterEach(cleanup);

  it('sends a rating as soon as it is pressed, and takes it back on a second press', () => {
    renderFeedback();

    const no = screen.getByRole('button', { name: 'No' });
    fireEvent.click(no);

    expect(no).toHaveAttribute('aria-pressed', 'true');
    expect(capture).toHaveBeenLastCalledWith(
      'survey sent',
      expect.objectContaining({
        [RATING]: 'No',
        $survey_completed: true,
        doc_path: '/get-started/glossary',
        locale: 'en',
      }),
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Thanks. Your answer was sent.',
    );

    fireEvent.click(no);
    expect(no).toHaveAttribute('aria-pressed', 'false');
    expect(capture).toHaveBeenLastCalledWith(
      'survey sent',
      expect.objectContaining({ $survey_completed: false }),
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Your answer was removed.',
    );
  });

  it('sends a comment under the same submission as the rating, then only thanks the reader', () => {
    renderFeedback();

    expect(
      screen.queryByRole('textbox', {
        name: 'How could this article be improved?',
      }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    const box = screen.getByRole('textbox', {
      name: 'How could this article be improved?',
    });
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    fireEvent.change(box, { target: { value: 'Add an example' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    const [, first] = capture.mock.calls[0] ?? [];
    const [, second] = capture.mock.calls[1] ?? [];
    expect(second).toMatchObject({
      [RATING]: 'Yes',
      [COMMENT]: 'Add an example',
    });
    expect(second.$survey_submission_id).toBe(first.$survey_submission_id);
    expect(screen.getByText('Thanks for your feedback.')).toHaveFocus();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Did this article help?'),
    ).not.toBeInTheDocument();
  });

  it('replaces the announcement for every result, even a repeated one', () => {
    renderFeedback();

    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    const first = screen.getByRole('status').firstElementChild;
    fireEvent.click(screen.getByRole('button', { name: 'No' }));
    const second = screen.getByRole('status').firstElementChild;

    expect(second).toHaveTextContent('Thanks. Your answer was sent.');
    expect(second).not.toBe(first);
  });
});
