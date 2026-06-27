import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetDeferredPrompt, mockSubscribe, mockPromptInstall } = vi.hoisted(
  () => ({
    mockGetDeferredPrompt: vi.fn(),
    mockSubscribe: vi.fn(() => () => {}),
    mockPromptInstall: vi.fn(),
  }),
);

vi.mock('~/utils/installPrompt', () => ({
  getDeferredPrompt: mockGetDeferredPrompt,
  subscribeInstallPrompt: mockSubscribe,
  promptInstall: mockPromptInstall,
}));

import PwaInstallNudge from '../PwaInstallNudge';

const DISMISSED_KEY = 'architect:pwa-install-nudge-dismissed';
const SHOW_DELAY_MS = 5000;
// A stable object so useSyncExternalStore's snapshot doesn't change identity.
const FAKE_PROMPT = {};

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
  it('renders nothing when no install prompt is available', () => {
    mockGetDeferredPrompt.mockReturnValue(null);
    const { container } = render(<PwaInstallNudge />);
    passDelay();
    expect(container).toBeEmptyDOMElement();
  });

  it('waits for the delay before showing', () => {
    mockGetDeferredPrompt.mockReturnValue(FAKE_PROMPT);
    render(<PwaInstallNudge />);

    expect(screen.queryByText(/use it like an app/i)).not.toBeInTheDocument();
    passDelay();
    expect(screen.getByText(/use it like an app/i)).toBeInTheDocument();
  });

  it('installs on click once shown', () => {
    mockGetDeferredPrompt.mockReturnValue(FAKE_PROMPT);
    render(<PwaInstallNudge />);
    passDelay();

    fireEvent.click(screen.getByRole('button', { name: /^install$/i }));
    expect(mockPromptInstall).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when previously dismissed', () => {
    localStorage.setItem(DISMISSED_KEY, 'true');
    mockGetDeferredPrompt.mockReturnValue(FAKE_PROMPT);
    const { container } = render(<PwaInstallNudge />);
    passDelay();
    expect(container).toBeEmptyDOMElement();
  });

  it('persists dismissal and hides when dismissed', () => {
    mockGetDeferredPrompt.mockReturnValue(FAKE_PROMPT);
    render(<PwaInstallNudge />);
    passDelay();

    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));

    expect(localStorage.getItem(DISMISSED_KEY)).toBe('true');
    expect(screen.queryByText(/use it like an app/i)).not.toBeInTheDocument();
  });
});
