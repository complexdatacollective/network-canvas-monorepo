import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FieldLabel } from './FieldLabel';

describe('FieldLabel', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // A label is one line, which the editor writes with no links.
  it('shows a link as its words', () => {
    const { container } = render(
      <FieldLabel>Visit [docs](https://example.com)</FieldLabel>,
    );

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(container).toHaveTextContent('Visit docs');
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
