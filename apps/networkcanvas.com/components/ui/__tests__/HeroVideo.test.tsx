import { render } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { HeroVideo } from '../HeroVideo';

const motionPreference = vi.hoisted(() => ({ reduced: false }));
const backgroundTargetRef = vi.hoisted(() => vi.fn());

vi.mock('motion/react', () => ({
  useReducedMotion: () => motionPreference.reduced,
}));

vi.mock('@codaco/art', () => ({
  usePageBackgroundTargetRef: () => backgroundTargetRef,
}));

describe('HeroVideo', () => {
  beforeEach(() => {
    motionPreference.reduced = false;
    backgroundTargetRef.mockClear();
  });

  it('renders the poster before client effects run', () => {
    const markup = renderToStaticMarkup(<HeroVideo />);

    expect(markup).not.toContain('<video');
    expect(markup).toContain('src="/images/hero-video-poster.jpg"');
  });

  it('autoplays the muted inline video after mounting for normal motion', () => {
    const { container } = render(<HeroVideo />);
    const video = container.querySelector('video');

    expect(video).not.toBeNull();
    expect(video).toHaveAttribute('autoplay');
    expect(video).toHaveAttribute('loop');
    expect(video).toHaveAttribute('playsinline');
    expect(video).toHaveAttribute('preload', 'metadata');
    expect(video).toHaveProperty('muted', true);
    expect(video?.querySelector('source')).toHaveAttribute(
      'src',
      '/videos/hero-video.mp4',
    );
  });

  it('registers its stable outer frame as the background target', () => {
    const { container } = render(<HeroVideo />);

    expect(backgroundTargetRef).toHaveBeenCalledWith(
      container.firstElementChild,
    );
  });

  it('renders only the poster for reduced motion', () => {
    motionPreference.reduced = true;

    const { container } = render(<HeroVideo />);

    expect(container.querySelector('video')).toBeNull();
    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      '/images/hero-video-poster.jpg',
    );
  });
});
