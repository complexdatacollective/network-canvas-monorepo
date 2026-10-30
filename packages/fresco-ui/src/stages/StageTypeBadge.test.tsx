import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StageTypeBadge } from './StageTypeBadge';

describe('StageTypeBadge', () => {
  it('draws the stage type in its colour, hidden from assistive technology', () => {
    const { container } = render(<StageTypeBadge type="Sociogram" />);
    const badge = container.firstElementChild;
    expect(badge).toHaveAttribute('aria-hidden', 'true');
    expect(badge).toHaveStyle({
      backgroundColor: 'var(--interface-sociogram)',
      color: 'var(--interface-sociogram-contrast)',
    });
    expect(badge?.querySelector('svg')).not.toBeNull();
  });

  it('draws a stage type this build does not know in a neutral grey', () => {
    const { container } = render(<StageTypeBadge type="FutureInterface" />);
    expect(container.firstElementChild).toHaveStyle({
      backgroundColor: 'oklch(var(--charcoal))',
    });
  });

  it('rings the badge in white, more widely at larger sizes', () => {
    const { container: small } = render(
      <StageTypeBadge type="Narrative" size="sm" ringed />,
    );
    const { container: large } = render(
      <StageTypeBadge type="Narrative" size="xl" ringed />,
    );
    expect(small.firstElementChild).toHaveClass('ring-white', 'ring-2');
    expect(large.firstElementChild).toHaveClass('ring-white', 'ring-8');
  });
});
