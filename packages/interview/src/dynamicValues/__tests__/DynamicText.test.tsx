import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DynamicMarkdown } from '../DynamicText';
import type { DynamicTextPart } from '../resolveDynamicText';

const sentence = (name: string): DynamicTextPart[] => [
  'Thanks for joining, **',
  { name: 'name', text: name },
  '**.',
];

describe('DynamicMarkdown', () => {
  it('updates a value in place when it changes', () => {
    const { container, rerender } = render(
      <DynamicMarkdown parts={sentence('Ada')} />,
    );
    const value = container.querySelector('[data-dynamic-value]');
    expect(value?.textContent).toBe('Ada');

    rerender(<DynamicMarkdown parts={sentence('Grace')} />);

    // The same element, so the value is not remounted (and does not lose
    // anything a remount would discard) each time it changes.
    expect(container.querySelector('[data-dynamic-value]')).toBe(value);
    expect(value?.textContent).toBe('Grace');
    expect(container.textContent).toBe('Thanks for joining, Grace.');
  });
});
