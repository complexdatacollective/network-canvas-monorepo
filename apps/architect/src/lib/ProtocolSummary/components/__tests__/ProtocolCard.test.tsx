import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PROTOCOL_NAME_MAX_LENGTH } from '~/config';

import ProtocolCard from '../ProtocolCard';

vi.mock('@codaco/art', () => ({
  Pattern: () => <div data-testid="protocol-pattern" />,
}));

const renderCard = (name: string) =>
  render(<ProtocolCard name={name} lastModified={null} schemaVersion={8} />);

// #1397 AC2, on the summary cover. The diagnosis called this surface "already
// bounded" from a print-page measurement, but on screen the heading has no
// bound at all: a 400-character unbroken token measured 549px inside a 720px
// viewport, and `ProtocolRouteGuard` renders this cover as the WHOLE read-only
// view a tab gets when it loses the protocol lock.
describe('ProtocolCard', () => {
  it('renders a name within the product limit exactly as before', () => {
    renderCard('All Interfaces');

    const heading = screen.getByRole('heading', { name: 'All Interfaces' });
    expect(heading).toHaveClass('wrap-break-word', 'hyphens-auto');
    // No clamp below the cap — which is also what keeps `summary-print.png`
    // (captured with this very fixture name) pixel-identical.
    expect(heading).not.toHaveClass('line-clamp-3');
  });

  it('clamps a legacy name the product limit never saw', () => {
    const legacy = 'A'.repeat(400);
    renderCard(legacy);

    const heading = screen.getByRole('heading', { name: legacy });
    expect(heading).toHaveClass('line-clamp-3');
    // Clamped in paint only: the whole value is still in the accessibility
    // tree and on `title`, so nothing is destroyed or hidden from a reader.
    expect(heading).toHaveTextContent(legacy);
    expect(heading).toHaveAttribute('title', legacy);
  });

  it('counts the limit in graphemes, so an emoji name is not clamped early', () => {
    const emojiName = '🧑‍🤝‍🧑'.repeat(PROTOCOL_NAME_MAX_LENGTH);
    expect(emojiName.length).toBe(PROTOCOL_NAME_MAX_LENGTH * 8);

    renderCard(emojiName);

    expect(screen.getByRole('heading')).not.toHaveClass('line-clamp-3');
  });

  it('gives an RTL name its own base direction', () => {
    const arabic = 'مشروع بحث الشبكات الاجتماعية';
    renderCard(arabic);

    expect(screen.getByRole('heading', { name: arabic })).toHaveAttribute(
      'dir',
      'auto',
    );
  });
});
