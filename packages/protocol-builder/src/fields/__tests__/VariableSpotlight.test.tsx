import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { CreateRowOutcome } from '../VariableSpotlight.tsx';
import VariableSpotlight from '../VariableSpotlight.tsx';

function Host({
  onCreate,
  onOpenChange,
}: {
  onCreate: (name: string) => Promise<CreateRowOutcome>;
  onOpenChange: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <VariableSpotlight
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        setOpen(next);
      }}
      options={[]}
      onSelect={() => undefined}
      onCreate={onCreate}
    />
  );
}

describe('VariableSpotlight', () => {
  it('cannot be dismissed while a create is written, and closes once it is', async () => {
    const user = userEvent.setup();
    let answer: (outcome: CreateRowOutcome) => void = () => undefined;
    const onCreate = vi.fn(
      () =>
        new Promise<CreateRowOutcome>((resolve) => {
          answer = resolve;
        }),
    );
    const onOpenChange = vi.fn();
    render(<Host onCreate={onCreate} onOpenChange={onOpenChange} />);

    await user.keyboard('nominated_early');
    await user.click(
      await screen.findByRole('option', {
        name: 'Create new attribute called “nominated_early”.',
      }),
    );
    expect(onCreate).toHaveBeenCalledWith('nominated_early');

    // The codebook write completes whatever happens to the window, so leaving
    // it now would look like calling the create off.
    await user.keyboard('{Escape}');
    await user.click(document.body);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await act(async () => {
      answer('finished');
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
