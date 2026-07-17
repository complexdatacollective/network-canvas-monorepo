import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../hooks/useStageSelector', () => ({
  useStageSelector: vi.fn(),
}));

vi.mock('../../../../../hooks/useAssetUrl', () => ({
  useAssetUrl: vi.fn(),
}));

vi.mock('../../../../../analytics/useTrack', () => ({
  useCaptureException: () => vi.fn(),
}));

vi.mock('../../../../../contract/context', () => ({
  useContractFlags: () => ({ isE2E: false }),
}));

import type { ResolvedAsset } from '../../../../../contract/types';
import { useAssetUrl } from '../../../../../hooks/useAssetUrl';
import { useStageSelector } from '../../../../../hooks/useStageSelector';
import protocol from '../../../../../store/modules/protocol';
import IntroStep, { shouldSkipIntroStep } from '../IntroStep';

function renderIntroStep(assets: ResolvedAsset[] = []) {
  const store = configureStore({
    reducer: { protocol },
    preloadedState: {
      // Partial protocol slice — only `assets` is read by asset items.
      protocol: { assets } as never,
    },
  });

  function Wrapper({ children }: { children: ReactNode }) {
    return <Provider store={store}>{children}</Provider>;
  }

  return render(<IntroStep />, { wrapper: Wrapper });
}

describe('IntroStep', () => {
  it('renders text items', () => {
    vi.mocked(useStageSelector).mockReturnValue({
      items: [
        {
          id: 't1',
          type: 'text',
          content: 'Welcome to the family pedigree builder.',
        },
      ],
    });
    vi.mocked(useAssetUrl).mockReturnValue({
      url: null,
      isLoading: false,
      error: null,
    });

    renderIntroStep();

    expect(
      screen.getByText('Welcome to the family pedigree builder.'),
    ).toBeTruthy();
  });

  it('renders items in order', () => {
    vi.mocked(useStageSelector).mockReturnValue({
      items: [
        { id: 't1', type: 'text', content: 'First section.' },
        { id: 't2', type: 'text', content: 'Second section.' },
      ],
    });
    vi.mocked(useAssetUrl).mockReturnValue({
      url: null,
      isLoading: false,
      error: null,
    });

    renderIntroStep();

    const first = screen.getByText('First section.');
    const second = screen.getByText('Second section.');
    expect(
      first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('renders a video element for a video asset item', () => {
    vi.mocked(useStageSelector).mockReturnValue({
      items: [{ id: 'v1', type: 'asset', content: 'asset-123' }],
    });
    vi.mocked(useAssetUrl).mockReturnValue({
      url: 'https://example.com/video.mp4',
      isLoading: false,
      error: null,
    });

    renderIntroStep([
      {
        assetId: 'asset-123',
        name: 'Intro video',
        type: 'video',
        source: 'intro.mp4',
      },
    ]);

    const video = document.querySelector('video');
    expect(video).toBeTruthy();
    expect(video?.getAttribute('aria-label')).toBe('Intro video');
  });

  it('does not render a video element when there is no asset item', () => {
    vi.mocked(useStageSelector).mockReturnValue({
      items: [{ id: 't1', type: 'text', content: 'No video here.' }],
    });
    vi.mocked(useAssetUrl).mockReturnValue({
      url: null,
      isLoading: false,
      error: null,
    });

    renderIntroStep();

    const video = document.querySelector('video');
    expect(video).toBeNull();
  });
});

describe('shouldSkipIntroStep', () => {
  it('skips when the intro screen is not configured', () => {
    expect(shouldSkipIntroStep(null)).toBe(true);
    expect(shouldSkipIntroStep(undefined)).toBe(true);
  });

  it('skips when the intro screen has no items', () => {
    expect(shouldSkipIntroStep({ items: [] })).toBe(true);
  });

  it('does not skip when the intro screen has items', () => {
    expect(
      shouldSkipIntroStep({
        items: [{ id: 't1', type: 'text', content: 'Hello' }],
      }),
    ).toBe(false);
  });
});
