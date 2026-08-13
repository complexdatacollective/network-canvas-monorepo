import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SyntheticField } from './SyntheticData';

describe('SyntheticField count means', () => {
  it('allows negative normal means while keeping Poisson nonnegative', () => {
    const { rerender } = render(
      <SyntheticField
        value={{ count: { distribution: 'normal', mean: -2, sd: 3 } }}
        showCount
        showTopology={false}
        interfaceType="NameGenerator"
      />,
    );

    expect(
      screen.getByRole('spinbutton', { name: 'Mean' }),
    ).not.toHaveAttribute('min');

    rerender(
      <SyntheticField
        value={{ count: { distribution: 'poisson', mean: 2 } }}
        showCount
        showTopology={false}
        interfaceType="NameGenerator"
      />,
    );

    expect(screen.getByRole('spinbutton', { name: 'Mean' })).toHaveAttribute(
      'min',
      '0',
    );
  });
});
