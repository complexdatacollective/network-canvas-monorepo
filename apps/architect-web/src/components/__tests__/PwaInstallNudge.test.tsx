import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
// A stable object so useSyncExternalStore's snapshot doesn't change identity.
const FAKE_PROMPT = {};

afterEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('PwaInstallNudge', () => {
  it('renders nothing when no install prompt is available', () => {
    mockGetDeferredPrompt.mockReturnValue(null);
    const { container } = render(<PwaInstallNudge />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the nudge and installs on click when a prompt is available', () => {
    mockGetDeferredPrompt.mockReturnValue(FAKE_PROMPT);
    render(<PwaInstallNudge />);

    expect(screen.getByText(/install architect/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^install$/i }));
    expect(mockPromptInstall).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when previously dismissed', () => {
    localStorage.setItem(DISMISSED_KEY, 'true');
    mockGetDeferredPrompt.mockReturnValue(FAKE_PROMPT);
    const { container } = render(<PwaInstallNudge />);
    expect(container).toBeEmptyDOMElement();
  });

  it('persists dismissal and hides when dismissed', () => {
    mockGetDeferredPrompt.mockReturnValue(FAKE_PROMPT);
    render(<PwaInstallNudge />);

    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));

    expect(localStorage.getItem(DISMISSED_KEY)).toBe('true');
    expect(screen.queryByText(/install architect/i)).not.toBeInTheDocument();
  });
});
