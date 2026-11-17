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
});
