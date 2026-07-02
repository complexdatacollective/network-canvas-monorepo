import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

import { InstallBanner } from '../InstallBanner';

const SESSION_DISMISS_KEY = 'interviewer-v8:install-banner-dismissed';
// A stable object so useSyncExternalStore's snapshot doesn't change identity.
const FAKE_PROMPT = {};

const stubDisplayMode = (standalone: boolean) => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: standalone && query === '(display-mode: standalone)',
  }));
};

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe('InstallBanner', () => {
  it('urges installation with a one-tap button when the browser offers a prompt', () => {
    stubDisplayMode(false);
    mockGetDeferredPrompt.mockReturnValue(FAKE_PROMPT);
    render(<InstallBanner />);

    expect(screen.getByText(/7 days/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^install$/i }));
    expect(mockPromptInstall).toHaveBeenCalledTimes(1);
  });

  it('falls back to Safari/Chrome instructions when no prompt is available', () => {
    stubDisplayMode(false);
    mockGetDeferredPrompt.mockReturnValue(null);
    render(<InstallBanner />);

    expect(screen.getByText(/add to dock/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^install$/i }),
    ).not.toBeInTheDocument();
  });

  it('renders nothing when running as an installed app', () => {
    stubDisplayMode(true);
    mockGetDeferredPrompt.mockReturnValue(FAKE_PROMPT);
    const { container } = render(<InstallBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('dismissal hides it and persists for the session only', () => {
    stubDisplayMode(false);
    mockGetDeferredPrompt.mockReturnValue(null);
    render(<InstallBanner />);

    fireEvent.click(screen.getByRole('button', { name: /close/i }));

    expect(screen.queryByText(/7 days/i)).not.toBeInTheDocument();
    expect(sessionStorage.getItem(SESSION_DISMISS_KEY)).toBe('true');
  });

  it('stays hidden when already dismissed this session', () => {
    stubDisplayMode(false);
    sessionStorage.setItem(SESSION_DISMISS_KEY, 'true');
    mockGetDeferredPrompt.mockReturnValue(FAKE_PROMPT);
    const { container } = render(<InstallBanner />);
    expect(container).toBeEmptyDOMElement();
  });
});
