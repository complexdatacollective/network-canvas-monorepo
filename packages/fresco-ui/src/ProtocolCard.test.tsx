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

    const card = screen.getByTestId('protocol-card');
    expect(card).toContainElement(screen.getByTestId('protocol-background'));
    expect(card).toContainElement(screen.getByText('Protocol preview'));
  });

  it('eases only the shadow, and only while the card is active', () => {
    const { rerender } = render(
      <ProtocolCard background={null} data-testid="protocol-card">
        <span>Protocol preview</span>
      </ProtocolCard>,
    );
    const card = screen.getByTestId('protocol-card');
    expect(card.style.transition).toBe('');

    rerender(
      <ProtocolCard background={null} data-testid="protocol-card" isActive>
        <span>Protocol preview</span>
      </ProtocolCard>,
    );
    expect(card.style.transition).toMatch(/^box-shadow \d+ms linear\(/);
  });
});
