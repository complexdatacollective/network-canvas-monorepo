import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { grants } from '~/lib/content';

import { Grants } from '../Grants';

describe('Grants', () => {
  it('keeps the slide clipped while leaving room for the card shadow', () => {
    render(<Grants />);

    const card = screen
      .getByRole('heading', { name: grants[0]?.title })
      .closest('a');
    const viewport = card?.parentElement;
    const frame = viewport?.parentElement;

    expect(frame).toHaveClass('relative', 'min-h-[22rem]', 'flex-1');
    expect(frame).not.toHaveClass('overflow-hidden');
    expect(viewport).toHaveClass(
      'absolute',
      '-inset-8',
      'overflow-hidden',
      'p-8',
    );
  });
});
