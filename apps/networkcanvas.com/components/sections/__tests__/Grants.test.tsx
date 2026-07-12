import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { grants } from '~/lib/content';

import { Grants } from '../Grants';

afterEach(cleanup);

describe('Grants', () => {
  it('uses Fresco icon controls to paginate grants', () => {
    render(<Grants />);

    const previous = screen.getByRole('button', { name: 'Previous grant' });
    const next = screen.getByRole('button', { name: 'Next grant' });

    for (const control of [previous, next]) {
      expect(control).toHaveClass(
        'aspect-square',
        'p-0!',
        'size-11',
        'bg-surface',
        'shadow-lg',
      );
      expect(control.querySelector('svg')).toHaveAttribute(
        'aria-hidden',
        'true',
      );
    }

    fireEvent.click(next);

    expect(screen.getByRole('button', { name: 'Show grant 2' })).toHaveClass(
      'w-7',
    );

    fireEvent.click(previous);

    expect(screen.getByRole('button', { name: 'Show grant 1' })).toHaveClass(
      'w-7',
    );
  });

  it('keeps pagination dots as compact native buttons', () => {
    render(<Grants />);

    const thirdGrant = screen.getByRole('button', { name: 'Show grant 3' });

    expect(thirdGrant).toHaveClass('h-2.5', 'w-2.5');
    expect(thirdGrant).not.toHaveClass('aspect-square', 'elevation-low');

    fireEvent.click(thirdGrant);

    expect(thirdGrant).toHaveClass('w-7');
    expect(screen.getByRole('button', { name: 'Show grant 1' })).toHaveClass(
      'w-2.5',
    );
  });

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
