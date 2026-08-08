import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import Node from './Node';

const node = () => screen.getByRole('button');

describe('Node toggle state', () => {
  it('reports selection for a node whose taps arrive as clicks', () => {
    render(<Node label="Ash" onClick={vi.fn()} selected />);
    expect(node()).toHaveAttribute('aria-pressed', 'true');
  });

  it('stays silent for a node that is not a toggle at all', () => {
    render(<Node label="Ash" />);
    expect(node()).not.toHaveAttribute('aria-pressed');
  });

  it('lets a host declare the state when its taps do not arrive as clicks', () => {
    // A canvas node drives selection from pointer events, so there is no
    // onClick for Node to infer a toggle from — the state has to be given.
    render(<Node label="Ash" selected aria-pressed={true} />);
    expect(node()).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps a declared state off roles that cannot carry it', () => {
    render(<Node label="Ash" role="option" selected aria-pressed={true} />);
    expect(screen.getByRole('option')).not.toHaveAttribute('aria-pressed');
  });
});
