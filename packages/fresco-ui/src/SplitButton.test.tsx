import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChevronDown } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';

import SplitButton from './SplitButton';

const defaultSegment = {
  'aria-label': 'Open options',
  'icon': <ChevronDown />,
};

describe('SplitButton', () => {
  it('uses Button props for the main action segment', () => {
    render(
      <SplitButton
        className="opacity-90"
        popover={{ content: <div>More save options</div> }}
        segment={defaultSegment}
      >
        Save
      </SplitButton>,
    );

    const mainButton = screen.getByRole('button', { name: 'Save' });
    expect(mainButton).toHaveClass('opacity-90');
  });

  it('squares the internal edge for right and left popover segments', () => {
    const { rerender } = render(
      <SplitButton
        popover={{ content: <div>More save options</div> }}
        segment={defaultSegment}
      >
        Save
      </SplitButton>,
    );

    expect(screen.getByRole('button', { name: 'Save' })).toHaveClass(
      'rounded-r-none!',
    );
    expect(screen.getByRole('button', { name: 'Open options' })).toHaveClass(
      'rounded-l-none!',
    );

    rerender(
      <SplitButton
        popover={{ content: <div>More save options</div> }}
        segment={{ ...defaultSegment, position: 'left' }}
      >
        Save
      </SplitButton>,
    );

    expect(screen.getByRole('button', { name: 'Save' })).toHaveClass(
      'rounded-l-none!',
    );
    expect(screen.getByRole('button', { name: 'Open options' })).toHaveClass(
      'rounded-r-none!',
    );
  });

  it('fires the main button action without opening the popover', async () => {
    const onClick = vi.fn();
    render(
      <SplitButton
        onClick={onClick}
        popover={{ content: <div>More save options</div> }}
        segment={{
          'aria-label': 'Open save options',
          'icon': <ChevronDown />,
        }}
      >
        Save
      </SplitButton>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.queryByText('More save options')).not.toBeInTheDocument();
  });

  it('opens popover content from the split segment', async () => {
    render(
      <SplitButton
        popover={{ content: <div>More save options</div> }}
        segment={defaultSegment}
      >
        Save
      </SplitButton>,
    );

    const trigger = screen.getByRole('button', { name: 'Open options' });
    expect(trigger).toHaveAttribute('aria-haspopup');

    await userEvent.click(trigger);

    expect(await screen.findByText('More save options')).toBeInTheDocument();
  });

  it('disables both segments when the split button is disabled', async () => {
    render(
      <SplitButton
        disabled
        popover={{ content: <div>More save options</div> }}
        segment={defaultSegment}
      >
        Saved
      </SplitButton>,
    );

    expect(screen.getByRole('button', { name: 'Saved' })).toBeDisabled();
    const segmentButton = screen.getByRole('button', { name: 'Open options' });
    expect(segmentButton).toBeDisabled();

    await userEvent.click(segmentButton);

    expect(screen.queryByText('More save options')).not.toBeInTheDocument();
  });
});
