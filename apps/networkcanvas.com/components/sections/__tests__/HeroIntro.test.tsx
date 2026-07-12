import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { HeroIntro } from '../HeroIntro';

const backgroundProps = vi.hoisted(() => vi.fn());

vi.mock('@codaco/art', () => ({
  BackgroundLights: (props: unknown) => {
    backgroundProps(props);
    return null;
  },
}));

vi.mock('~/components/layout/Header', () => ({
  Header: () => <div>Header content</div>,
}));

vi.mock('~/components/sections/Hero', () => ({
  Hero: () => <div>Hero content</div>,
}));

describe('HeroIntro', () => {
  it('renders the header, hero, and token-colored background lights', () => {
    render(<HeroIntro />);

    expect(screen.getByText('Header content')).toBeInTheDocument();
    expect(screen.getByText('Hero content')).toBeInTheDocument();
    expect(backgroundProps).toHaveBeenCalledWith(
      expect.objectContaining({
        large: 1,
        medium: 3,
        small: 0,
        colors: [
          'oklch(var(--neon-coral))',
          'oklch(var(--sea-green))',
          'oklch(var(--cerulean-blue))',
          'oklch(var(--mustard))',
        ],
      }),
    );
  });
});
