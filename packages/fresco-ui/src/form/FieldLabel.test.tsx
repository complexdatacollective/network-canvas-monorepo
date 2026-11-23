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

  it('shows an escaped character as the character', () => {
    render(<FieldLabel>{'&gt; 5 years'}</FieldLabel>);

    expect(screen.getByText('> 5 years')).toBeInTheDocument();
  });

  it('reads a label as markdown, with HTML shown as typed', () => {
    const { container } = render(
      <FieldLabel>{'**Age** in <em>years</em>'}</FieldLabel>,
    );

    expect(container.querySelector('strong')).toHaveTextContent('Age');
    expect(container.querySelector('em')).toBeNull();
    expect(container).toHaveTextContent('Age in <em>years</em>');
  });
});
