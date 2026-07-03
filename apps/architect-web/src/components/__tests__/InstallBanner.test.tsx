import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetDeferredPrompt,
  mockSubscribe,
  mockPromptInstall,
  mockInstalled,
} = vi.hoisted(() => ({
  mockGetDeferredPrompt: vi.fn(),
  mockSubscribe: vi.fn(() => () => {}),
  mockPromptInstall: vi.fn(),
  mockInstalled: vi.fn(() => false),
}));

vi.mock('~/utils/installPrompt', () => ({
  getDeferredPrompt: mockGetDeferredPrompt,
  subscribeInstallPrompt: mockSubscribe,
  promptInstall: mockPromptInstall,
}));

vi.mock('~/utils/pwa', () => ({
  isRunningAsInstalledPwa: mockInstalled,
}));

import InstallBanner from '../InstallBanner';

const SESSION_DISMISS_KEY = 'architect:install-banner-dismissed';
// A stable object so useSyncExternalStore's snapshot doesn't change identity.
const FAKE_PROMPT = {};

const stubBrowser = ({
  chromium = false,
  firefox = false,
  platform = '',
  touchPoints = 0,
}: {
  chromium?: boolean;
  firefox?: boolean;
  platform?: string;
  touchPoints?: number;
}) => {
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
  mockInstalled.mockReturnValue(false);
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe('InstallBanner', () => {
  it('Chromium with a prompt: generic eviction copy and a one-tap Install', () => {
    stubBrowser({ chromium: true });
    mockGetDeferredPrompt.mockReturnValue(FAKE_PROMPT);
    render(<InstallBanner />);

    expect(screen.getByText(/deleted by the browser/i)).toBeInTheDocument();
    expect(screen.queryByText(/7 days/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /install/i }));
    expect(mockPromptInstall).toHaveBeenCalledTimes(1);
  });

  it('Chromium without a prompt: points at the address-bar install icon', () => {
    stubBrowser({ chromium: true });
    mockGetDeferredPrompt.mockReturnValue(null);
    render(<InstallBanner />);

    expect(screen.getByText(/address bar/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /install/i }),
    ).not.toBeInTheDocument();
  });

  it('Safari on a Mac: 7-day eviction and Add to Dock', () => {
    stubBrowser({ platform: 'MacIntel', touchPoints: 0 });
    mockGetDeferredPrompt.mockReturnValue(null);
    render(<InstallBanner />);

    expect(screen.getByText(/7 days/i)).toBeInTheDocument();
    expect(screen.getByText(/add to dock/i)).toBeInTheDocument();
  });

  it('Safari on an iPad: Add to Home Screen', () => {
    stubBrowser({ platform: 'MacIntel', touchPoints: 5 });
    mockGetDeferredPrompt.mockReturnValue(null);
    render(<InstallBanner />);

    expect(screen.getByText(/add to home screen/i)).toBeInTheDocument();
  });

  it('Firefox: recommends an installable browser', () => {
    stubBrowser({ firefox: true });
    mockGetDeferredPrompt.mockReturnValue(null);
    render(<InstallBanner />);

    expect(screen.getByText(/chrome, edge, or safari/i)).toBeInTheDocument();
  });

  it('renders nothing when running as an installed app', () => {
    stubBrowser({ chromium: true });
    mockInstalled.mockReturnValue(true);
    mockGetDeferredPrompt.mockReturnValue(FAKE_PROMPT);
    const { container } = render(<InstallBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('dismissal hides it and persists for the session only', () => {
    stubBrowser({ platform: 'MacIntel' });
    mockGetDeferredPrompt.mockReturnValue(null);
    render(<InstallBanner />);

    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));

    expect(screen.queryByText(/7 days/i)).not.toBeInTheDocument();
    expect(sessionStorage.getItem(SESSION_DISMISS_KEY)).toBe('true');
  });

  it('stays hidden when already dismissed this session', () => {
    stubBrowser({ platform: 'MacIntel' });
    sessionStorage.setItem(SESSION_DISMISS_KEY, 'true');
    mockGetDeferredPrompt.mockReturnValue(FAKE_PROMPT);
    const { container } = render(<InstallBanner />);
    expect(container).toBeEmptyDOMElement();
  });
});
