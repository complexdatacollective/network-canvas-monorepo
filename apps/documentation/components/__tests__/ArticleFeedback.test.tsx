import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import messages from '../../messages/en.json';
import ArticleFeedback from '../ArticleFeedback';

const { capture, route } = vi.hoisted(() => ({
  capture: vi.fn(),
  route: { pathname: '/get-started/glossary', section: 'get-started' },
}));

vi.mock('posthog-js', () => {
  const posthog = { capture, __loaded: true };
  return { default: posthog, posthog };
});

vi.mock('next/navigation', () => ({
  useParams: () => ({ section: route.section }),
}));

vi.mock('~/navigation', () => ({ usePathname: () => route.pathname }));

const RATING = '$survey_response_c5b666c2-1e43-4ff8-b212-ea3b3bd327ae';
const COMMENT = '$survey_response_220d2d7a-3cb1-4061-9c03-dc02ff1b44e4';
const QUESTION = 'Did you get what you needed from this article?';
const COMMENT_LABEL = 'How could this article be improved?';

let observers: IntersectionObserverCallback[] = [];

function scrollPromptIntoView(isIntersecting = true) {
  act(() => {
    for (const notify of observers) {
      notify(
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- only isIntersecting is read
        [{ isIntersecting } as IntersectionObserverEntry],
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the observer argument is unused
        {} as IntersectionObserver,
      );
    }
  });
}

const feedback = () => (
  <NextIntlClientProvider locale="en" messages={messages}>
    <ArticleFeedback />
  </NextIntlClientProvider>
);

const sent = (): Record<string, unknown>[] =>
  capture.mock.calls
    .filter(([event]) => event === 'survey sent')
    .map(([, properties]) => properties);

describe('ArticleFeedback', () => {
  beforeEach(() => {
    capture.mockClear();
    route.pathname = '/get-started/glossary';
    route.section = 'get-started';
    observers = [];
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        private readonly callback: IntersectionObserverCallback;
        constructor(callback: IntersectionObserverCallback) {
          this.callback = callback;
        }
        observe() {
          observers.push(this.callback);
        }
        disconnect() {
          observers = observers.filter((entry) => entry !== this.callback);
        }
      },
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('records a rating as a complete response as soon as it is pressed, without a comment', () => {
    render(feedback());

    expect(screen.getByRole('group', { name: QUESTION })).toBeInTheDocument();
    const no = screen.getByRole('button', { name: 'No' });
    fireEvent.click(no);

    expect(no).toHaveAttribute('aria-pressed', 'true');
    expect(sent()).toHaveLength(1);
    expect(capture).toHaveBeenLastCalledWith('survey sent', {
      $survey_id: '01a1fa2f-5595-0000-a91f-b16efc12bc06',
      $survey_submission_id: expect.any(String),
      $survey_completed: true,
      [RATING]: 'No',
      doc_path: '/get-started/glossary',
      section: 'get-started',
      locale: 'en',
    });
    expect(screen.getByRole('status')).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Thanks, feedback sent.',
    );
  });

  it('keeps a rating when its button is pressed again, and changes it under the same submission', () => {
    render(feedback());

    const yes = screen.getByRole('button', { name: 'Yes' });
    const no = screen.getByRole('button', { name: 'No' });
    fireEvent.click(yes);
    fireEvent.click(yes);

    expect(yes).toHaveAttribute('aria-pressed', 'true');
    expect(sent()).toHaveLength(1);

    fireEvent.click(no);
    expect(yes).toHaveAttribute('aria-pressed', 'false');
    expect(no).toHaveAttribute('aria-pressed', 'true');
    const [first, second] = sent();
    expect(second).toMatchObject({ [RATING]: 'No', $survey_completed: true });
    expect(second?.$survey_submission_id).toBe(first?.$survey_submission_id);
  });

  it('sends a comment under the same submission as the rating, then only thanks the reader', () => {
    render(feedback());

    expect(
      screen.queryByRole('textbox', { name: COMMENT_LABEL }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    const box = screen.getByRole('textbox', { name: COMMENT_LABEL });
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    fireEvent.change(box, { target: { value: 'Add an example' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    const [first, second] = sent();
    expect(second).toMatchObject({
      [RATING]: 'Yes',
      [COMMENT]: 'Add an example',
    });
    expect(second?.$survey_submission_id).toBe(first?.$survey_submission_id);
    expect(screen.getByText('Thanks for your feedback.')).toHaveFocus();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText(QUESTION)).not.toBeInTheDocument();
  });

  it('replaces the announcement for every rating, even though the message repeats', () => {
    render(feedback());

    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    const first = screen.getByRole('status').firstElementChild;
    fireEvent.click(screen.getByRole('button', { name: 'No' }));
    const second = screen.getByRole('status').firstElementChild;

    expect(second).toHaveTextContent('Thanks, feedback sent.');
    expect(second).not.toBe(first);
  });

  it('reports the prompt as shown once, when it scrolls into view', () => {
    render(feedback());

    scrollPromptIntoView(false);
    expect(capture).not.toHaveBeenCalled();

    scrollPromptIntoView();
    scrollPromptIntoView();

    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith('survey shown', {
      $survey_id: '01a1fa2f-5595-0000-a91f-b16efc12bc06',
      doc_path: '/get-started/glossary',
      section: 'get-started',
      locale: 'en',
    });
  });

  it('starts a new response on another article', () => {
    const { rerender } = render(feedback());

    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    route.pathname = '/design-protocols/stages/sociogram';
    route.section = 'design-protocols';
    rerender(feedback());

    expect(screen.getByRole('button', { name: 'Yes' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    fireEvent.click(screen.getByRole('button', { name: 'No' }));
    const [first, second] = sent();
    expect(second?.doc_path).toBe('/design-protocols/stages/sociogram');
    expect(second?.$survey_submission_id).not.toBe(
      first?.$survey_submission_id,
    );
  });
});
