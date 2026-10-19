import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const goToLegacyInterviewer = vi.hoisted(() => vi.fn());
vi.mock('~/lib/legacyInterviewer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/lib/legacyInterviewer')>()),
  goToLegacyInterviewer,
}));

const { LegacyInterviewsNotice } = await import('../LegacyInterviewsNotice');

describe('LegacyInterviewsNotice', () => {
  it('says how many interviews Interviewer 8 keeps and opens its data view', async () => {
    render(
      <LegacyInterviewsNotice
        count={12}
        interviewer={{ version: '8.5.0', path: '/v8/' }}
      />,
    );
    expect(
      screen.getByText(
        '12 interviews from schema 8 protocols are kept in Interviewer 8.',
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(goToLegacyInterviewer).toHaveBeenCalledWith('/v8/data');
  });

  it('counts one interview in the singular', () => {
    render(
      <LegacyInterviewsNotice
        count={1}
        interviewer={{ version: '8.5.0', path: '/v8/' }}
      />,
    );
    expect(
      screen.getByText(
        '1 interview from schema 8 protocols is kept in Interviewer 8.',
      ),
    ).toBeInTheDocument();
  });
});
