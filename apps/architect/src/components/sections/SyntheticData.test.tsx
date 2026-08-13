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

  it('allows negative normal mean-degree means while keeping density nonnegative', () => {
    const { rerender } = render(
      <SyntheticField
        value={{
          topology: {
            metric: 'meanDegree',
            distribution: { distribution: 'normal', mean: -1, sd: 2 },
          },
        }}
        showCount={false}
        showTopology
        interfaceType="Sociogram"
      />,
    );

    expect(
      screen.getByRole('spinbutton', { name: 'Mean' }),
    ).not.toHaveAttribute('min');

    rerender(
      <SyntheticField
        value={{
          topology: {
            metric: 'density',
            distribution: { distribution: 'normal', mean: 0.5, sd: 0.1 },
          },
        }}
        showCount={false}
        showTopology
        interfaceType="Sociogram"
      />,
    );

    expect(screen.getByRole('spinbutton', { name: 'Mean' })).toHaveAttribute(
      'min',
      '0',
    );
  });
});
