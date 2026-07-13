import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ExternalLink } from './ExternalLink';

describe('ExternalLink', () => {
  it('uses the shared prose-link treatment with external-link semantics', () => {
    render(
      <ExternalLink href="https://community.networkcanvas.com">
        Community forum
      </ExternalLink>,
    );

    const link = screen.getByRole('link', { name: 'Community forum' });

    expect(link).toHaveAttribute('href', 'https://community.networkcanvas.com');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveClass('focusable', 'text-link', 'font-semibold');
  });
});
