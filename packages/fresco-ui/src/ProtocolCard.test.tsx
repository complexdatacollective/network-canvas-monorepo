import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProtocolCard } from './ProtocolCard';

describe('ProtocolCard', () => {
  it('renders the supplied background and content in the shared shell', () => {
    render(
      <ProtocolCard
        background={<div data-testid="protocol-background" />}
        data-testid="protocol-card"
      >
        <span>Protocol preview</span>
      </ProtocolCard>,
    );

    expect(screen.getByTestId('protocol-background')).toBeInTheDocument();
    expect(screen.getByText('Protocol preview')).toBeInTheDocument();
    expect(screen.getByTestId('protocol-card')).toHaveClass(
      'bg-platinum',
      'overflow-clip',
    );
  });

  it('applies the active deck treatment', () => {
    render(
      <ProtocolCard background={<div />} isActive data-testid="protocol-card">
        Content
      </ProtocolCard>,
    );

    expect(screen.getByTestId('protocol-card')).toHaveClass('spring-medium');
    expect(screen.getByTestId('protocol-card')).not.toHaveClass(
      'effect-shadow-xl',
      'effect-shadow-2xl',
    );
  });
});
