import { Toast } from '@base-ui/react/toast';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Toaster } from '@codaco/fresco-ui/Toast';

const { mockGetDeferredPrompt, mockSubscribe, mockPromptInstall } = vi.hoisted(
  () => ({
    mockGetDeferredPrompt: vi.fn(),
    mockSubscribe: vi.fn(() => () => {}),
    mockPromptInstall: vi.fn(),
  }),
);

vi.mock('~/lib/pwa/installPrompt', () => ({
  getDeferredPrompt: mockGetDeferredPrompt,
  subscribeInstallPrompt: mockSubscribe,
  promptInstall: mockPromptInstall,
}));

import PwaInstallNudge from '../PwaInstallNudge';

const DISMISSED_KEY = 'interviewer-v8:pwa-install-nudge-dismissed';
const SHOW_DELAY_MS = 5000;
// A stable object so useSyncExternalStore's snapshot doesn't change identity.
const FAKE_PROMPT = {};

// The nudge dispatches into the app's toast system, so tests render it inside
// a real provider + viewport and assert against the toast output.
const renderNudge = () =>
  render(
    <Toast.Provider>
      <PwaInstallNudge />
      <Toaster />
    </Toast.Provider>,
  );

const passDelay = () => act(() => vi.advanceTimersByTime(SHOW_DELAY_MS));

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.clearAllMocks();
  localStorage.clear();
});

describe('PwaInstallNudge', () => {
  it('shows no toast when no install prompt is available', () => {
    mockGetDeferredPrompt.mockReturnValue(null);
    renderNudge();
    passDelay();
    expect(screen.queryByText(/install interviewer/i)).not.toBeInTheDocument();
  });

  it('waits for the delay before showing', () => {
    mockGetDeferredPrompt.mockReturnValue(FAKE_PROMPT);
    renderNudge();

    expect(screen.queryByText(/install interviewer/i)).not.toBeInTheDocument();
    passDelay();
    expect(screen.getByText(/install interviewer/i)).toBeInTheDocument();
  });

  it('installs on click once shown', () => {
    mockGetDeferredPrompt.mockReturnValue(FAKE_PROMPT);
    renderNudge();
    passDelay();

    fireEvent.click(screen.getByRole('button', { name: /^install$/i }));
    expect(mockPromptInstall).toHaveBeenCalledTimes(1);
  });

  it('shows no toast when previously dismissed', () => {
    localStorage.setItem(DISMISSED_KEY, 'true');
    mockGetDeferredPrompt.mockReturnValue(FAKE_PROMPT);
    renderNudge();
    passDelay();
    expect(screen.queryByText(/install interviewer/i)).not.toBeInTheDocument();
  });

  // The toast's ✕ (and swipe) route through the same onClose as the Install
  // action; base-ui hides the close button in jsdom (no hover capability), so
  // the Install path is the closure we can exercise here.
  it('persists dismissal when the toast closes', () => {
    mockGetDeferredPrompt.mockReturnValue(FAKE_PROMPT);
    renderNudge();
    passDelay();

    fireEvent.click(screen.getByRole('button', { name: /^install$/i }));

    expect(localStorage.getItem(DISMISSED_KEY)).toBe('true');
    expect(
      screen.queryByRole('button', { name: /^install$/i }),
    ).not.toBeInTheDocument();
  });
});
