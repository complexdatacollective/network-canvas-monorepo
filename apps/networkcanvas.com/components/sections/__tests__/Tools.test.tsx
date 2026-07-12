import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Tools } from '../Tools';

vi.mock('~/components/ui/DeviceMockup', () => ({
  DeviceMockup: () => <div />,
}));

vi.mock('~/components/ui/Reveal', () => ({
  Reveal: ({
    children,
    className,
  }: {
    children: ReactNode;
    className?: string;
  }) => <section className={className}>{children}</section>,
}));

describe('Tools', () => {
  it('uses translucent blurred panels and a slate-blue Fresco accent', () => {
    const { container } = render(<Tools />);
    const panels = container.querySelectorAll('section.backdrop-blur-md');

    expect(panels).toHaveLength(3);
    expect(screen.getByRole('heading', { name: 'Fresco' })).toHaveClass(
      'text-slate-blue',
    );
    expect(screen.getByRole('link', { name: 'Learn More' })).toHaveClass(
      'bg-slate-blue',
    );
  });
});
