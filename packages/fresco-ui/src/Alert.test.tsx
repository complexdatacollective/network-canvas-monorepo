import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Alert } from './Alert';

describe('Alert', () => {
  it('keeps the full intent colour for the soft appearance', () => {
    render(
      <Alert variant="accent" appearance="soft">
        Key concept
      </Alert>,
    );

    const alert = screen.getByRole('status');
    expect(alert).toHaveClass('bg-accent', 'text-accent-contrast');
    expect(alert.className).not.toContain('color-mix');
  });
});
