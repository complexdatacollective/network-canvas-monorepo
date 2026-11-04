import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FieldLabel } from './FieldLabel';

describe('FieldLabel', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens markdown links externally', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);

    await act(async () => {
      render(<FieldLabel>Visit [docs](https://example.com)</FieldLabel>);
    });
    await screen.findByRole('link', { name: 'docs' }, { timeout: 10_000 });

    fireEvent.click(screen.getByRole('link', { name: 'docs' }));

    expect(open).toHaveBeenCalledWith(
      'https://example.com',
      '_blank',
      'noopener,noreferrer',
    );
  });
});
