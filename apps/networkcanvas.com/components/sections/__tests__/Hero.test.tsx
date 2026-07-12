import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Hero } from '../Hero';

describe('Hero', () => {
  it('uses the large desktop headline scale and cyber-grape body copy', () => {
    render(<Hero />);

    expect(
      screen.getByRole('heading', {
        name: 'Simplifying complex network data collection.',
      }),
    ).toHaveClass(
      'tablet-portrait:text-[4rem]',
      'tablet-landscape:text-[4.5rem]',
      'desktop:text-[5rem]',
    );
    expect(screen.getByText(/Network Canvas provides/)).toHaveClass(
      'text-cyber-grape',
    );
  });
});
