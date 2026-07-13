import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PageBackground } from '../PageBackground';

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
      transition,
    }: {
      animate?: unknown;
      children: ReactNode;
      initial?: unknown;
      transition?: unknown;
    }) => {
      fadeProps({ animate, initial, transition });
      return <div data-testid="blob-fade">{children}</div>;
    },
  },
  useReducedMotion: () => motionPreference.reduced,
}));

vi.mock('@codaco/art', () => ({
  BackgroundBlobs: (props: unknown) => {
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
    const layer = container.firstElementChild;

    expect(layer).toHaveAttribute('aria-hidden', 'true');
    expect(layer).toHaveClass(
      'pointer-events-none',
      'fixed',
      'inset-0',
      'z-0',
      'opacity-10',
    );
    expect(screen.getByTestId('background-blobs')).toBeInTheDocument();
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
    expect(
      screen.queryByTestId('static-blob-background'),
    ).not.toBeInTheDocument();
    expect(fadeProps).toHaveBeenCalledWith(
      expect.objectContaining({
        initial: { opacity: 0 },
        animate: { opacity: 1 },
      }),
    );
  });

  it('keeps the layer transparent and omits the canvas for reduced motion', () => {
    motionPreference.reduced = true;

    render(<PageBackground />);

    expect(screen.queryByTestId('background-blobs')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('static-blob-background'),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('blob-fade')).not.toBeInTheDocument();
    expect(backgroundBlobsProps).not.toHaveBeenCalled();
  });
});
