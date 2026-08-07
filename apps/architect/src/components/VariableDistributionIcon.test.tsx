import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { VariableDistributionIcon } from './VariableDistributionIcon';

describe('VariableDistributionIcon', () => {
  it('draws distinct continuous-distribution silhouettes', () => {
    const { container, rerender } = render(
      <VariableDistributionIcon
        shape={{
          kind: 'continuous',
          distribution: 'normal',
          mean: 50,
          sd: 10,
        }}
      />,
    );
    const normalPath = container
      .querySelector('[data-distribution-shape]')
      ?.getAttribute('d');

    rerender(
      <VariableDistributionIcon
        shape={{
          kind: 'continuous',
          distribution: 'lognormal',
          mean: 50,
          sd: 10,
        }}
      />,
    );

    expect(
      container.querySelector('[data-distribution-shape]')?.getAttribute('d'),
    ).not.toBe(normalPath);
    expect(
      container.querySelector('[data-variable-pill-distribution="lognormal"]'),
    ).toBeInTheDocument();
  });

  it('uses beta parameters to change the plotted shape', () => {
    const { container, rerender } = render(
      <VariableDistributionIcon
        shape={{
          kind: 'continuous',
          distribution: 'beta',
          mean: 0.25,
          sd: 0.12,
        }}
      />,
    );
    const leftSkewedPath = container
      .querySelector('[data-distribution-shape]')
      ?.getAttribute('d');

    rerender(
      <VariableDistributionIcon
        shape={{
          kind: 'continuous',
          distribution: 'beta',
          mean: 0.75,
          sd: 0.12,
        }}
      />,
    );

    expect(
      container.querySelector('[data-distribution-shape]')?.getAttribute('d'),
    ).not.toBe(leftSkewedPath);
  });

  it('plots a fixed value as a line instead of a distribution shape', () => {
    const { container } = render(
      <VariableDistributionIcon
        shape={{ kind: 'continuous', distribution: 'constant' }}
      />,
    );

    expect(container.querySelector('[data-distribution-axes]')).toHaveAttribute(
      'd',
      expect.stringMatching(/V .* H /),
    );
    expect(
      container.querySelector('[data-distribution-fixed-value]'),
    ).toHaveAttribute('d', expect.stringMatching(/M .* V /));
    expect(container.querySelector('[data-distribution-shape]')).toBeNull();
  });

  it.each([
    {
      kind: 'continuous' as const,
      distribution: 'normal' as const,
      mean: 50,
      sd: 10,
    },
    { kind: 'boolean' as const, probabilityTrue: 0.75 },
    { kind: 'options' as const, weights: [1, 3, 2] },
  ])('draws x and y axes for $kind distributions', (shape) => {
    const { container } = render(<VariableDistributionIcon shape={shape} />);

    expect(container.querySelector('[data-distribution-axes]')).toHaveAttribute(
      'd',
      expect.stringMatching(/V .* H /),
    );
  });

  it('plots discrete probabilities as bars', () => {
    const { container, rerender } = render(
      <VariableDistributionIcon
        shape={{ kind: 'boolean', probabilityTrue: 0.75 }}
      />,
    );

    expect(container.querySelectorAll('rect')).toHaveLength(2);

    rerender(
      <VariableDistributionIcon
        shape={{ kind: 'options', weights: [1, 3, 5, 2] }}
      />,
    );

    expect(container.querySelectorAll('rect')).toHaveLength(4);
  });
});
