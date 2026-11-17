import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import CloseButton, { CloseButtonTooltipContext } from '../CloseButton';
import AddAPersonIcon from '../icons/add-a-person-single.svg.react';

afterEach(cleanup);

describe('CloseButton', () => {
  it('shows its name as a tooltip by default', () => {
    render(<CloseButton />);
    const button = screen.getByRole('button', { name: 'Close' });
    expect(button).toHaveAttribute('title', 'Close');
  });

  // An interview has no words of this package's in its own language, so the
  // tooltip would be English whatever the interview's language.
  it('shows no tooltip where the region turns tooltips off', () => {
    render(
      <CloseButtonTooltipContext value={false}>
        <CloseButton />
      </CloseButtonTooltipContext>,
    );
    const button = screen.getByRole('button', { name: 'Close' });
    expect(button).not.toHaveAttribute('title');
    expect(button).toHaveAttribute('lang', 'en');
  });
});

describe('custom icons', () => {
  it('carry their name as a title', () => {
    const { container } = render(<AddAPersonIcon />);
    expect(container.querySelector('svg > title')).toHaveTextContent(
      'Add a person',
    );
  });

  // A decorative icon sits in a control that carries the name; a title would
  // only show the name again as a tooltip.
  it('carry no title when hidden from screen readers', () => {
    const { container } = render(<AddAPersonIcon aria-hidden />);
    expect(container.querySelector('svg > title')).toBeNull();
  });
});
