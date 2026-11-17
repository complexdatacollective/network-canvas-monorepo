import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

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
  // The clamp itself is checked in ProtocolCard.stories.tsx, where the
  // stylesheet applies.
  it('keeps a clamped legacy name whole for a reader', () => {
    const legacy = 'A'.repeat(400);
    renderCard(legacy);

    const heading = screen.getByRole('heading', { name: legacy });
    // Clamped in paint only: the whole value is still in the accessibility
    // tree and on `title`, so nothing is destroyed or hidden from a reader.
    expect(heading).toHaveTextContent(legacy);
    expect(heading).toHaveAttribute('title', legacy);
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
