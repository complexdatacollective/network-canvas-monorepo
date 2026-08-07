import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Tooltip, TooltipContent, TooltipTrigger } from './Tooltip';

async function openTooltip(pointerEvents?: 'auto' | 'none') {
  const user = userEvent.setup();
  render(
    <Tooltip>
      <TooltipTrigger render={<button type="button">Trigger</button>} />
      <TooltipContent aria-hidden="true" pointerEvents={pointerEvents}>
        Tooltip text
      </TooltipContent>
    </Tooltip>,
  );

  const trigger = screen.getByRole('button', { name: 'Trigger' });
  await user.tab();
  expect(trigger).toHaveFocus();
  await waitFor(() => expect(trigger).toHaveAttribute('data-popup-open'));

  const popup = document.querySelector(
    '[data-base-ui-portal] [data-open][aria-hidden="true"]',
  );
  expect(popup).toBeInTheDocument();
  // The Positioner is the portaled root the container's
  // [&>*]:pointer-events-auto rule targets.
  return popup!.closest('[data-base-ui-portal] > *')!;
}

describe('Tooltip', () => {
  it('leaves the positioner interactive by default', async () => {
    const positioner = await openTooltip();
    expect(positioner).not.toHaveClass('pointer-events-none!');
  });

  it('disables pointer events on the positioner when pointerEvents="none"', async () => {
    const positioner = await openTooltip('none');
    expect(positioner).toHaveClass('pointer-events-none!');
  });
});
