import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('~/hooks/useStageSelector', () => ({
  useStageSelector: vi.fn(),
}));

vi.mock('~/hooks/useAssetUrl', () => ({
  useAssetUrl: vi.fn(),
}));

vi.mock('~/analytics/useTrack', () => ({
  useCaptureException: () => vi.fn(),
}));

vi.mock('~/contract/context', () => ({
  useContractFlags: () => ({ isE2E: false }),
}));

import { useAssetUrl } from '~/hooks/useAssetUrl';
import { useStageSelector } from '~/hooks/useStageSelector';

import IntroStep from '../IntroStep';

describe('IntroStep', () => {
  it('renders introScreen text', () => {
    vi.mocked(useStageSelector).mockReturnValue({
      text: 'Welcome to the family pedigree builder.',
    });
    vi.mocked(useAssetUrl).mockReturnValue({
      url: null,
      isLoading: false,
      error: null,
    });

    render(<IntroStep />);

    expect(
      screen.getByText('Welcome to the family pedigree builder.'),
    ).toBeTruthy();
  });

  it('renders introScreen title when present', () => {
    vi.mocked(useStageSelector).mockReturnValue({
      title: 'Getting Started',
      text: 'Some introductory text.',
    });
    vi.mocked(useAssetUrl).mockReturnValue({
      url: null,
      isLoading: false,
      error: null,
    });

    render(<IntroStep />);

    expect(screen.getByText('Getting Started')).toBeTruthy();
  });

  it('does not render title element when title is absent', () => {
    vi.mocked(useStageSelector).mockReturnValue({
      text: 'Some text without a title.',
    });
    vi.mocked(useAssetUrl).mockReturnValue({
      url: null,
      isLoading: false,
      error: null,
    });

    render(<IntroStep />);

    const heading = screen.queryByRole('heading');
    expect(heading).toBeNull();
  });

  it('renders a video element when videoAssetId is present and url resolves', () => {
    vi.mocked(useStageSelector).mockReturnValue({
      text: 'Watch this.',
      videoAssetId: 'asset-123',
    });
    vi.mocked(useAssetUrl).mockReturnValue({
      url: 'https://example.com/video.mp4',
      isLoading: false,
      error: null,
    });

    render(<IntroStep />);

    const video = screen.getByTitle('Intro video');
    expect(video).toBeTruthy();
  });

  it('does not render a video element when videoAssetId is absent', () => {
    vi.mocked(useStageSelector).mockReturnValue({
      text: 'No video here.',
    });
    vi.mocked(useAssetUrl).mockReturnValue({
      url: null,
      isLoading: false,
      error: null,
    });

    render(<IntroStep />);

    const video = document.querySelector('video');
    expect(video).toBeNull();
  });
});
