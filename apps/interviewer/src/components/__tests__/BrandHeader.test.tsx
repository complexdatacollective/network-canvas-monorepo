import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BrandHeader } from '../BrandHeader';

describe('BrandHeader', () => {
  it('names the page with a level-one heading', () => {
    render(<BrandHeader />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Interviewer' }),
    ).toBeInTheDocument();
  });
});
