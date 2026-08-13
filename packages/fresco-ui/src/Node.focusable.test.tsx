import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import Node from './Node';

const node = () => screen.getByRole('button');

describe('Node focusability', () => {
  it('earns a tab stop from activation', () => {
    render(<Node label="Ash" onClick={vi.fn()} />);
    expect(node().tabIndex).toBe(0);
  });

  it('earns no tab stop from pointer-only gestures', () => {
    // Drags and holds are reached exclusively through the pointer; focusing
    // such a node would hand a keyboard user a control that does nothing.
    render(<Node label="Ash" onDragStart={vi.fn()} onLongPress={vi.fn()} />);
    expect(node().tabIndex).toBe(-1);
  });

  it('earns a tab stop from a host-supplied keyboard handler', () => {
    // A canvas provides arrow-key nudging and Delete this way.
    render(<Node label="Ash" onDragStart={vi.fn()} onKeyDown={vi.fn()} />);
    expect(node().tabIndex).toBe(0);
  });

  it('earns a tab stop from a clipped label, which focus reveals', async () => {
    Object.defineProperty(HTMLSpanElement.prototype, 'scrollHeight', {
      configurable: true,
      get: () => 60,
    });
    Object.defineProperty(HTMLSpanElement.prototype, 'clientHeight', {
      configurable: true,
      get: () => 40,
    });
    try {
      render(<Node label={'a'.repeat(200)} />);
      await act(async () => {});
      expect(node().tabIndex).toBe(0);
    } finally {
      Reflect.deleteProperty(HTMLSpanElement.prototype, 'scrollHeight');
      Reflect.deleteProperty(HTMLSpanElement.prototype, 'clientHeight');
    }
  });

  it('stays out of the tab order when display-only', () => {
    render(<Node label="Ash" />);
    expect(node().tabIndex).toBe(-1);
  });
});
