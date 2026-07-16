import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetDeferredPrompt,
  mockSubscribe,
  mockPromptInstall,
  mockGetInstalled,
  mockSubscribeInstalled,
  setInstalled,
  resetInstalled,
} = vi.hoisted(() => {
  const installedListeners = new Set<() => void>();
  let installed = false;
  return {
    mockGetDeferredPrompt: vi.fn(),
    mockSubscribe: vi.fn(() => () => {}),
    mockPromptInstall: vi.fn(),
    mockGetInstalled: vi.fn(() => installed),
    mockSubscribeInstalled: vi.fn((listener: () => void) => {
      installedListeners.add(listener);
      return () => installedListeners.delete(listener);
    }),
    // Test helper: flip the store and notify subscribers, mirroring the real
    // `appinstalled` path so the banner re-renders without a refresh.
    setInstalled: (next: boolean) => {
      installed = next;
      for (const listener of installedListeners) listener();
    },
    resetInstalled: () => {
      installed = false;
      installedListeners.clear();
    },
  };
});

vi.mock('~/utils/installPrompt', () => ({
  getDeferredPrompt: mockGetDeferredPrompt,
  subscribeInstallPrompt: mockSubscribe,
  promptInstall: mockPromptInstall,
  getInstalled: mockGetInstalled,
  subscribeInstalled: mockSubscribeInstalled,
}));

import InstallBanner from '../InstallBanner';

const SESSION_DISMISS_KEY = 'architect:install-banner-dismissed';
// A stable object so useSyncExternalStore's snapshot doesn't change identity.
const FAKE_PROMPT = {};

const stubBrowser = ({
  chromium = false,
  firefox = false,
  iosChrome = false,
  platform = '',
  touchPoints = 0,
}: {
  chromium?: boolean;
  firefox?: boolean;
  iosChrome?: boolean;
  platform?: string;
  touchPoints?: number;
}) => {
  vi.stubGlobal('navigator', {
    platform,
    maxTouchPoints: touchPoints,
    userAgent: iosChrome
      ? 'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 CriOS/140.0 Mobile/15E148 Safari/604.1'
      : firefox
        ? 'Mozilla/5.0 (X11; Linux) Gecko/20100101 Firefox/141.0'
        : 'Mozilla/5.0 AppleWebKit/605.1.15 Safari/605.1.15',
    ...(chromium
      ? {
          userAgentData: {
            brands: [{ brand: 'Google Chrome', version: '140' }],
          },
        }
      : {}),
  });
};

afterEach(() => {
  vi.clearAllMocks();
  resetInstalled();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe('InstallBanner', () => {
  it('Chrome with a prompt: browser-specific low-risk copy and a one-tap Install', () => {
    stubBrowser({ chromium: true });
    mockGetDeferredPrompt.mockReturnValue(FAKE_PROMPT);
    render(<InstallBanner />);

    expect(
      screen.getByText(/Chrome rarely removes Network Canvas data/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/protect your protocols from being deleted/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/7 days/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole('status', { name: 'Install Architect' }),
    ).toHaveClass('bg-info');

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
    expect(
      screen.getByText(/Safari is known to remove Network Canvas data/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/protect your protocols from being deleted/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/add to dock/i)).toBeInTheDocument();
    expect(
      screen.getByRole('alert', { name: 'Install Architect' }),
    ).toHaveClass('bg-destructive');
  });

  it('Safari on an iPad: Add to Home Screen', () => {
    stubBrowser({ platform: 'MacIntel', touchPoints: 5 });
    mockGetDeferredPrompt.mockReturnValue(null);
    render(<InstallBanner />);

    expect(screen.getByText(/add to home screen/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Safari is known to remove Network Canvas data/i),
    ).toBeInTheDocument();
  });

  it('Chrome on iOS: names Chrome and explains its WebKit risk', () => {
    stubBrowser({ iosChrome: true, platform: 'iPhone', touchPoints: 5 });
    mockGetDeferredPrompt.mockReturnValue(null);
    render(<InstallBanner />);

    expect(
      screen.getByText(/Chrome on iOS uses WebKit, which is known to remove/i),
    ).toBeInTheDocument();
  });

  it('Firefox: recommends an installable browser', () => {
    stubBrowser({ firefox: true });
    mockGetDeferredPrompt.mockReturnValue(null);
    render(<InstallBanner />);

    expect(screen.getByText(/runs low on storage/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Firefox may remove Network Canvas data/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/allow persistent storage/i)).toBeInTheDocument();
    expect(
      screen.getByRole('status', { name: 'Install Architect' }),
    ).toHaveClass('bg-warning');
  });

  it('renders nothing when running as an installed app', () => {
    stubBrowser({ chromium: true });
    setInstalled(true);
    mockGetDeferredPrompt.mockReturnValue(FAKE_PROMPT);
    const { container } = render(<InstallBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('hides reactively when the app becomes installed mid-session', () => {
    stubBrowser({ chromium: true });
    mockGetDeferredPrompt.mockReturnValue(FAKE_PROMPT);
    render(<InstallBanner />);

    expect(
      screen.getByText(/Chrome rarely removes Network Canvas data/i),
    ).toBeInTheDocument();

    act(() => setInstalled(true));

    expect(
      screen.queryByText(/Chrome rarely removes Network Canvas data/i),
    ).not.toBeInTheDocument();
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
