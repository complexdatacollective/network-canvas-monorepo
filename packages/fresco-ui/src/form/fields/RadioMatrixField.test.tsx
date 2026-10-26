import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { findDanglingIdReferences } from '../../utils/ariaIdReferences';
import RadioMatrixField from './RadioMatrixField';

describe('RadioMatrixField', () => {
  it('gives response columns a readable minimum width in the wide layout', () => {
    render(
      <RadioMatrixField
        aria-label="Parent partnerships"
        name="partnerships"
        rows={[{ id: 'parent', label: 'Robert' }]}
        options={[
          { value: 'current', label: 'Current partner' },
          { value: 'former', label: 'Ex-partner' },
          { value: 'none', label: "Not a partner or Don't know" },
        ]}
      />,
    );

    const matrix = screen.getByRole('group', {
      name: 'Parent partnerships',
    });

    expect(matrix).toHaveClass('@3xl:grid');
    expect(matrix).toHaveStyle({
      gridTemplateColumns: 'minmax(12rem, 1fr) repeat(3, minmax(10rem, 0.5fr))',
    });
  });

  it('names each row from a heading whose id has no whitespace', () => {
    // Row ids are caller-supplied, so they must not reach an element id.
    const { container } = render(
      <RadioMatrixField
        aria-label="Parent partnerships"
        name="partnerships"
        rows={[
          { id: 'parent one', label: 'Robert' },
          { id: '母 2', label: 'Mei' },
        ]}
        options={[{ value: 'current', label: 'Current partner' }]}
      />,
    );

    for (const el of container.querySelectorAll('[id]')) {
      expect(el.id).not.toMatch(/\s/);
    }
    expect(findDanglingIdReferences(container)).toEqual([]);
    expect(screen.getByRole('radiogroup', { name: 'Robert' })).toBeVisible();
    expect(screen.getByRole('radiogroup', { name: 'Mei' })).toBeVisible();
  });
});
