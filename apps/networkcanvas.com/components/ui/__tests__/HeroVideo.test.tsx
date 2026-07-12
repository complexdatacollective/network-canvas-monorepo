import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { HeroVideo } from '../HeroVideo';

const motionPreference = vi.hoisted(() => ({ reduced: false }));

vi.mock('motion/react', () => ({
  useReducedMotion: () => motionPreference.reduced,
}));

describe('HeroVideo', () => {
  beforeEach(() => {
    motionPreference.reduced = false;
  });

  it('autoplays the muted inline video for normal motion', () => {
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
