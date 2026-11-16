import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Table, TableBody, TableCell, TableRow } from './Table';

const stubWidths = (scrollWidth: number, clientWidth: number) => {
  for (const [property, value] of [
    ['scrollWidth', scrollWidth],
    ['clientWidth', clientWidth],
  ] as const) {
    Object.defineProperty(HTMLElement.prototype, property, {
      configurable: true,
      get: () => value,
    });
  }
};

afterEach(() => {
  for (const property of ['scrollWidth', 'clientWidth']) {
    Reflect.deleteProperty(HTMLElement.prototype, property);
  }
});

const renderTable = () =>
  render(
    <Table aria-label="People">
      <TableBody>
        <TableRow>
          <TableCell>Ada</TableCell>
        </TableRow>
      </TableBody>
    </Table>,
  );

describe('Table scroll region', () => {
  it('is a named tab stop from the first render when the table overflows', () => {
    // Measured before the first paint, not when the observer first reports:
    // a scrolling box with no keyboard access is a WCAG 2.1.1 failure
    // (axe `scrollable-region-focusable`) for as long as the gap lasts.
    stubWidths(900, 300);
    renderTable();

    // No waitFor: nothing has been given a chance to run after the render.
    const region = screen.getByRole('region', { name: 'People' });
    expect(region).toHaveAttribute('tabindex', '0');
  });

  it('is neither a tab stop nor a landmark when the table fits', () => {
    stubWidths(300, 300);
    renderTable();

    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
  });
});
