import { cleanup, render, screen } from '@testing-library/react';
import type { CSSProperties, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PageBackground } from '../index';

const motionPreference = vi.hoisted<{ reduced: boolean | null }>(() => ({
  reduced: false,
}));
const backgroundBlobsProps = vi.hoisted(() => vi.fn());
const fadeProps = vi.hoisted(() => vi.fn());

vi.mock('motion/react', () => ({
  motion: {
    div: ({
      animate,
      children,
      initial,
      style,
      transition,
    }: {
      animate?: unknown;
      children: ReactNode;
      initial?: unknown;
      style?: CSSProperties;
      transition?: unknown;
    }) => {
      fadeProps({ animate, initial, style, transition });
      return <div data-testid="blob-fade">{children}</div>;
    },
  },
  useReducedMotion: () => motionPreference.reduced,
}));

vi.mock('../BackgroundBlobs/BackgroundBlobs', async (importOriginal) => ({
  ...(await importOriginal()),
  default: (props: unknown) => {
    backgroundBlobsProps(props);
    return <div data-testid="background-blobs" />;
  },
}));

describe('PageBackground', () => {
  afterEach(() => {
    cleanup();
    document.documentElement.removeAttribute('style');
  });

  beforeEach(() => {
    backgroundBlobsProps.mockClear();
    fadeProps.mockClear();
    motionPreference.reduced = false;
    document.documentElement.style.setProperty(
      '--neon-coral',
      '.5733 .2584 11.57',
    );
    document.documentElement.style.setProperty('--mustard', '.81 .17 86.39');
    document.documentElement.style.setProperty('--sea-green', '.7 .2 171.52');
    document.documentElement.style.setProperty(
      '--cerulean-blue',
      '.5824 .229 260.09',
    );
  });

  it('renders subtle fixed theme-colored blobs for normal motion', () => {
    const { container } = render(<PageBackground />);
    const layer = container.firstElementChild as HTMLElement | null;

    expect(layer?.getAttribute('aria-hidden')).toBe('true');
    expect(layer?.style.position).toBe('fixed');
    expect(layer?.style.inset).toBe('0px');
    expect(layer?.style.zIndex).toBe('0');
    expect(layer?.style.overflow).toBe('hidden');
    expect(layer?.style.opacity).toBe('0.1');
    expect(layer?.style.pointerEvents).toBe('none');
    expect(screen.queryByTestId('background-blobs')).not.toBeNull();
    expect(backgroundBlobsProps).toHaveBeenCalledWith(
      expect.objectContaining({
        large: 2,
        medium: 3,
        small: 1,
        speedFactor: 0.35,
        palette: [
          ['oklch(.5733 .2584 11.57)', 'oklch(.81 .17 86.39)'],
          ['oklch(.7 .2 171.52)', 'oklch(.5824 .229 260.09)'],
          ['oklch(.5824 .229 260.09)', 'oklch(.5733 .2584 11.57)'],
        ],
      }),
    );
    expect(screen.queryByTestId('static-blob-background')).toBeNull();
    expect(fadeProps).toHaveBeenCalledWith(
      expect.objectContaining({
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        style: { position: 'absolute', inset: 0 },
      }),
    );
  });

  it('keeps the layer transparent and omits the canvas for reduced motion', () => {
    motionPreference.reduced = true;

    render(<PageBackground />);

    expect(screen.queryByTestId('background-blobs')).toBeNull();
    expect(screen.queryByTestId('static-blob-background')).toBeNull();
    expect(screen.queryByTestId('blob-fade')).toBeNull();
    expect(backgroundBlobsProps).not.toHaveBeenCalled();
  });
});
