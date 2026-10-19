import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { LegacyInterviewsNotice } from '../LegacyInterviewsNotice';

describe('LegacyInterviewsNotice', () => {
  it('says how many interviews Interviewer 8 keeps and opens its data view', async () => {
    const onOpen = vi.fn();
    render(<LegacyInterviewsNotice count={12} onOpen={onOpen} />);
    expect(
      screen.getByText(
        '12 interviews from schema 8 protocols are kept in Interviewer 8.',
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('counts one interview in the singular', () => {
    render(<LegacyInterviewsNotice count={1} onOpen={() => {}} />);
    expect(
      screen.getByText(
        '1 interview from schema 8 protocols is kept in Interviewer 8.',
      ),
    ).toBeInTheDocument();
  });
});
