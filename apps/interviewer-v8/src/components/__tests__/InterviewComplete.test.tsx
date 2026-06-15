import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { InterviewComplete } from '../InterviewComplete';

describe('InterviewComplete', () => {
  it('renders the completion heading and exit button', () => {
    render(<InterviewComplete onExit={vi.fn()} />);
    expect(screen.getByText('Interview complete')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exit' })).toBeInTheDocument();
  });

  it('calls onExit when the exit button is clicked', () => {
    const onExit = vi.fn();
    render(<InterviewComplete onExit={onExit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Exit' }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});
