import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FieldLabel } from './FieldLabel';

describe('FieldLabel', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens markdown links externally', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(<FieldLabel>Visit [docs](https://example.com)</FieldLabel>);

    fireEvent.click(screen.getByRole('link', { name: 'docs' }));

    expect(open).toHaveBeenCalledWith(
      'https://example.com',
      '_blank',
      'noopener,noreferrer',
    );
  });
});
