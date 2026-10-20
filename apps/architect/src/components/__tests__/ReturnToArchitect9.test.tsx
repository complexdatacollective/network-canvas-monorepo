import { act, render } from '@testing-library/react';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { beginProtocolCommit } from '~/utils/criticalOperation';
import { trackLaunchActivity } from '~/utils/launchActivity';

import ReturnToArchitect9 from '../ReturnToArchitect9';

const { returnToArchitect9 } = vi.hoisted(() => ({
  returnToArchitect9: vi.fn(),
}));

vi.mock('~/utils/architect9Handoff', () => ({ returnToArchitect9 }));

const settle = () => act(async () => {});

/** Launch work that stays in flight until `finish` is called. */
const pendingWork = () => {
  let finish: () => void = () => {};
  const work = new Promise<void>((resolve) => {
    finish = resolve;
  });
  return { work, finish: () => act(async () => finish()) };
};

beforeEach(() => {
  returnToArchitect9.mockClear();
});

describe('<ReturnToArchitect9 />', () => {
  it('goes back to Architect 9 when there is nothing to open', async () => {
    render(<ReturnToArchitect9 />);
    await settle();

    expect(returnToArchitect9).toHaveBeenCalledTimes(1);
  });

  it('waits for launch work, such as a dialog explaining a failed open', async () => {
    const { work, finish } = pendingWork();
    void trackLaunchActivity(work);

    render(<ReturnToArchitect9 />);
    await settle();
    expect(returnToArchitect9).not.toHaveBeenCalled();

    await finish();
    expect(returnToArchitect9).toHaveBeenCalledTimes(1);
  });

  // As the URL opener does from its own effect, whichever runs first.
  it('counts launch work another effect of the same render starts', async () => {
    const { work, finish } = pendingWork();
    const StartsWork = () => {
      useEffect(() => {
        void trackLaunchActivity(work);
      }, []);
      return null;
    };

    render(
      <>
        <ReturnToArchitect9 />
        <StartsWork />
      </>,
    );
    await settle();
    expect(returnToArchitect9).not.toHaveBeenCalled();

    await finish();
    expect(returnToArchitect9).toHaveBeenCalledTimes(1);
  });

  it('waits for a save still being written', async () => {
    const finishCommit = beginProtocolCommit();

    render(<ReturnToArchitect9 />);
    await settle();
    expect(returnToArchitect9).not.toHaveBeenCalled();

    act(() => {
      finishCommit();
    });
    expect(returnToArchitect9).toHaveBeenCalledTimes(1);
  });

  it('does nothing once unmounted, as when an open reaches the editor', async () => {
    const { unmount } = render(<ReturnToArchitect9 />);
    unmount();
    await settle();

    expect(returnToArchitect9).not.toHaveBeenCalled();
  });
});
