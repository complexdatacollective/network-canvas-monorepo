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

const SESSION_DISMISS_KEY = 'interviewer:install-banner-dismissed';
// A stable object so useSyncExternalStore's snapshot doesn't change identity.
const FAKE_PROMPT = {};

const stubEnvironment = ({
  standalone = false,
  chromium = false,
  firefox = false,
  platform = '',
  touchPoints = 0,
}: {
  standalone?: boolean;
  chromium?: boolean;
  firefox?: boolean;
  platform?: string;
  touchPoints?: number;
}) => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: standalone && query === '(display-mode: standalone)',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  vi.stubGlobal('navigator', {
    ...navigator,
    platform,
    maxTouchPoints: touchPoints,
    userAgent: firefox
      ? 'Mozilla/5.0 (X11; Linux) Gecko/20100101 Firefox/141.0'
      : 'Mozilla/5.0 AppleWebKit/605.1.15 Safari/605.1.15',
    ...(chromium ? { userAgentData: {} } : {}),
  });
};

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe('InstallBanner', () => {
  it('Chromium with a prompt: generic eviction copy and a one-tap Install', () => {
    stubEnvironment({ chromium: true });
    mockGetDeferredPrompt.mockReturnValue(FAKE_PROMPT);
    render(<InstallBanner />);

    expect(screen.getByText(/rarely delete site data/i)).toBeInTheDocument();
    expect(screen.queryByText(/7 days/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole('status', { name: 'Install Interviewer' }),
    ).toHaveClass('bg-info');

    fireEvent.click(screen.getByRole('button', { name: /^install$/i }));
    expect(mockPromptInstall).toHaveBeenCalledTimes(1);
  });

  it('Chromium without a prompt: points at the address-bar install icon', () => {
    stubEnvironment({ chromium: true });
    mockGetDeferredPrompt.mockReturnValue(null);
    render(<InstallBanner />);

    expect(screen.getByText(/address bar/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^install$/i }),
    ).not.toBeInTheDocument();
  });

  it('Safari on a Mac: 7-day eviction and Add to Dock', () => {
    stubEnvironment({ platform: 'MacIntel', touchPoints: 0 });
    mockGetDeferredPrompt.mockReturnValue(null);
    render(<InstallBanner />);

    expect(screen.getByText(/7 days/i)).toBeInTheDocument();
    expect(screen.getByText(/add to dock/i)).toBeInTheDocument();
    expect(
      screen.getByRole('alert', { name: 'Install Interviewer' }),
    ).toHaveClass('bg-destructive');
  });

  it('Safari on an iPad: Add to Home Screen', () => {
    stubEnvironment({ platform: 'MacIntel', touchPoints: 5 });
    mockGetDeferredPrompt.mockReturnValue(null);
    render(<InstallBanner />);

    expect(screen.getByText(/add to home screen/i)).toBeInTheDocument();
  });

  it('Firefox: recommends an installable browser', () => {
    stubEnvironment({ firefox: true });
    mockGetDeferredPrompt.mockReturnValue(null);
    render(<InstallBanner />);

    expect(screen.getByText(/runs low on storage/i)).toBeInTheDocument();
    expect(screen.getByText(/allow persistent storage/i)).toBeInTheDocument();
    expect(
      screen.getByRole('status', { name: 'Install Interviewer' }),
    ).toHaveClass('bg-warning');
    expect(
      screen.queryByRole('button', { name: /^install$/i }),
    ).not.toBeInTheDocument();
  });

  it('renders nothing when running as an installed app', () => {
    stubEnvironment({ standalone: true, chromium: true });
    mockGetDeferredPrompt.mockReturnValue(FAKE_PROMPT);
    const { container } = render(<InstallBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('dismissal hides it and persists for the session only', () => {
    stubEnvironment({ platform: 'MacIntel' });
    mockGetDeferredPrompt.mockReturnValue(null);
    render(<InstallBanner />);

    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));

    expect(screen.queryByText(/7 days/i)).not.toBeInTheDocument();
    expect(sessionStorage.getItem(SESSION_DISMISS_KEY)).toBe('true');
  });

  it('stays hidden when already dismissed this session', () => {
    stubEnvironment({ platform: 'MacIntel' });
    sessionStorage.setItem(SESSION_DISMISS_KEY, 'true');
    mockGetDeferredPrompt.mockReturnValue(FAKE_PROMPT);
    const { container } = render(<InstallBanner />);
    expect(container).toBeEmptyDOMElement();
  });
});
