import { render } from '@testing-library/react';
import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToStaticMarkup, renderToString } from 'react-dom/server';
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

  it('renders the poster before client effects run', () => {
    const markup = renderToStaticMarkup(<HeroVideo />);

    expect(markup).not.toContain('<video');
    expect(markup).toContain('src="/images/hero-video-poster.jpg"');
  });

  it('hydrates the server-rendered poster without a mismatch before swapping in the video', async () => {
    const container = document.createElement('div');
    container.innerHTML = renderToString(<HeroVideo />);
    document.body.append(container);

    expect(container.querySelector('video')).toBeNull();
    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      '/images/hero-video-poster.jpg',
    );

    const recoverableError = vi.fn();
    const root = hydrateRoot(container, <HeroVideo />, {
      onRecoverableError: recoverableError,
    });
    await act(async () => {});

    expect(recoverableError).not.toHaveBeenCalled();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('video')).not.toBeNull();

    await act(async () => root.unmount());
    container.remove();
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

  it('marks its stable outer frame as a homepage weave target', () => {
    const { container } = render(<HeroVideo />);

    expect(container.firstElementChild).toHaveAttribute(
      'data-homepage-weave-target',
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
