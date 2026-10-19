import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ isSubpath: true }));

vi.mock('~/lib/appBase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/lib/appBase')>()),
  get IS_SUBPATH_BUILD() {
    return mocks.isSubpath;
  },
}));

vi.mock('~/lib/handoff/interviewer9Navigation', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('~/lib/handoff/interviewer9Navigation')
  >()),
  leaveForInterviewer9: vi.fn(),
}));

import { leaveForInterviewer9 } from '~/lib/handoff/interviewer9Navigation';

import { Interviewer8Banner } from '../Interviewer8Banner';

const backButton = () =>
  screen.queryByRole('button', { name: 'Back to Interviewer' });

beforeEach(() => {
  mocks.isSubpath = true;
  vi.mocked(leaveForInterviewer9).mockClear();
});

describe('<Interviewer8Banner />', () => {
  it('says which Interviewer this is', () => {
    render(<Interviewer8Banner />);

    expect(
      screen.getByText('Interviewer 8, for schema 8 protocols'),
    ).toBeInTheDocument();
    expect(backButton()).toBeEnabled();
  });

  it('goes back to Interviewer at the origin root', () => {
    render(<Interviewer8Banner />);

    fireEvent.click(backButton() as HTMLElement);

    expect(leaveForInterviewer9).toHaveBeenCalledExactlyOnceWith('/');
  });

  it('is out of reach while it is inert', () => {
    render(<Interviewer8Banner inert />);

    expect(backButton()?.closest('[inert]')).not.toBeNull();
  });

  it('is not shown by the root build', () => {
    mocks.isSubpath = false;
    const { container } = render(<Interviewer8Banner />);

    expect(container).toBeEmptyDOMElement();
  });
});
