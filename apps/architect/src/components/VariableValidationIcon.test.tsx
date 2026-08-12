import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { ValidationName } from '@codaco/protocol-validation';

import { VariableValidationIcon } from './VariableValidationIcon';

const VALIDATION_ICONS = [
  'required',
  'requiredAcceptsNull',
  'minLength',
  'maxLength',
  'minValue',
  'maxValue',
  'minSelected',
  'maxSelected',
  'unique',
  'differentFrom',
  'sameAs',
  'greaterThanVariable',
  'lessThanVariable',
  'greaterThanOrEqualToVariable',
  'lessThanOrEqualToVariable',
] as const satisfies readonly ValidationName[];

describe('VariableValidationIcon', () => {
  it.each(VALIDATION_ICONS)('renders the %s constraint glyph', (icon) => {
    const { container } = render(<VariableValidationIcon validation={icon} />);

    expect(
      container.querySelector(`[data-variable-pill-validation="${icon}"]`),
    ).toBeInTheDocument();
    expect(container.querySelector('path, rect, circle')).toBeInTheDocument();
  });

  it('draws paired directions differently', () => {
    const { container, rerender } = render(
      <VariableValidationIcon validation="minValue" />,
    );
    const minimumPaths = Array.from(container.querySelectorAll('path')).map(
      (path) => path.getAttribute('d'),
    );

    rerender(<VariableValidationIcon validation="maxValue" />);

    expect(
      Array.from(container.querySelectorAll('path')).map((path) =>
        path.getAttribute('d'),
      ),
    ).not.toEqual(minimumPaths);
  });

  it.each([
    ['minLength', 'minValue', 'minSelected', 'greaterThanOrEqualToVariable'],
    ['maxLength', 'maxValue', 'maxSelected', 'lessThanOrEqualToVariable'],
    ['required', 'requiredAcceptsNull'],
  ] as const)('reuses one simple shape for equivalent rules', (...icons) => {
    const { container, rerender } = render(
      <VariableValidationIcon validation={icons[0]} />,
    );
    const shape = container.querySelector('svg')?.innerHTML;

    for (const icon of icons.slice(1)) {
      rerender(<VariableValidationIcon validation={icon} />);
      expect(container.querySelector('svg')?.innerHTML).toBe(shape);
    }
  });
});
