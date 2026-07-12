import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WorkflowPath } from '../WorkflowPath';

vi.mock('~/components/ui/Reveal', () => ({
  Reveal: ({
    children,
    className,
  }: {
    children: ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>,
}));

afterEach(cleanup);

describe('WorkflowPath', () => {
  it('uses Fresco typography while preserving section hierarchy and spacing', () => {
    render(<WorkflowPath workflow="design" apps={[]} />);

    const heading = screen.getByRole('heading', {
      level: 2,
      name: 'Design or create a protocol',
    });
    const label = screen.getByText('Path 01 · Design');
    const description = screen.getByText(
      'Build a new browser-based study in Architect, or keep a schema 7 workflow in Architect Classic when compatibility requires it.',
    );

    expect(heading).toHaveClass('scroll-m-20', 'mt-4!', 'text-4xl');
    expect(label).toHaveClass('text-pretty', 'opacity-100', 'font-heading');
    expect(description).toHaveClass('font-body', 'mt-5', 'text-lg');
    expect(description).not.toHaveClass('not-last:mb-[1em]');
  });
});
