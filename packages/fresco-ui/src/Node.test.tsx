import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Node from './Node';

const rootOf = (label: string) => {
  const root = screen.getByText(label).closest('.text-\\(--ink\\)');
  if (!root) throw new Error(`No node root found for ${label}`);
  return root;
};

describe('Node label ink', () => {
  it('takes a palette color ink from its paired contrast token', () => {
    render(<Node color="node-color-seq-5" label="Kiwi" />);

    const root = rootOf('Kiwi');
    expect(root).toHaveClass('[--ink:var(--node-5-contrast)]');
    expect(root).not.toHaveClass('[--ink:var(--node-1-contrast)]');
  });

  it('gives a custom color white ink unless contrast-color() is supported', () => {
    render(<Node color="custom" label="Custom" />);

    const root = rootOf('Custom');
    expect(root).toHaveClass('[--ink:var(--color-white)]');
    expect(root).toHaveClass(
      'supports-[color:contrast-color(red)]:[--ink:contrast-color(var(--base))]',
    );
    expect(root).not.toHaveClass('[--ink:var(--node-1-contrast)]');
  });
});
