import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

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
});
