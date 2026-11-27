import {
  render,
  screen,
  waitFor,
  waitForElementToBeRemoved,
} from '@testing-library/react';
import { useMemo } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { reduced, springs } from '@codaco/fresco-ui/motion';
import {
  ToolbarButton,
  ToolbarGroup,
  ToolbarIconButton,
} from '@codaco/fresco-ui/SegmentedToolbar';
import { ACTION_TOOLBAR_REACH_VARIABLE } from '~/utils/actionToolbarReach';

import {
  ActionToolbarProvider,
  toolbarEnterExitMotion,
  useActionToolbar,
} from './ActionToolbar';

// The toolbar's transition comes from the shared presets: watch which one it
// asks for.
vi.mock('@codaco/fresco-ui/motion', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@codaco/fresco-ui/motion')>();
  return { ...actual, reduced: vi.fn(actual.reduced) };
});

const TimelineToolbarController = () => {
  const props = useMemo(
    () => ({
      'aria-label': 'Timeline actions',
      'children': [
        <ToolbarGroup key="timeline" aria-label="Timeline controls">
          <ToolbarButton>Download</ToolbarButton>
        </ToolbarGroup>,
      ],
    }),
    [],
  );

  useActionToolbar(props);
  return null;
};

const StageToolbarController = () => {
  const props = useMemo(
    () => ({
      'aria-label': 'Stage editor actions',
      'children': [
        <ToolbarGroup key="stage" aria-label="Stage controls">
          <ToolbarButton>Finished Editing</ToolbarButton>
        </ToolbarGroup>,
      ],
    }),
    [],
  );

  useActionToolbar(props);
  return null;
};

const HistoryToolbarController = ({ visible }: { visible: boolean }) => {
  const props = useMemo(
    () => ({
      children: [
        <ToolbarGroup key="page" aria-label="Page controls">
          <ToolbarButton>Download</ToolbarButton>
        </ToolbarGroup>,
      ],
      leadingActions: visible ? (
        <ToolbarGroup key="history" aria-label="History controls">
          <ToolbarIconButton aria-label="Undo" icon={<span />} />
        </ToolbarGroup>
      ) : undefined,
    }),
    [visible],
  );

  useActionToolbar(props);
  return null;
};

describe('ActionToolbarProvider', () => {
  it('publishes how far up the page its toolbar reaches, while one is drawn', async () => {
    const reach = () =>
      document.documentElement.style.getPropertyValue(
        ACTION_TOOLBAR_REACH_VARIABLE,
      );
    const { unmount } = render(
      <ActionToolbarProvider>
        <TimelineToolbarController />
      </ActionToolbarProvider>,
    );
    // 600px is what the test environment's `ResizeObserver` reports for
    // every element: the published value is the observed one.
    await waitFor(() => expect(reach()).toBe('600px'));
    unmount();
    expect(reach()).toBe('');
  });

  it('keeps the same toolbar mounted while route controllers change', () => {
    const { rerender } = render(
      <ActionToolbarProvider>
        <TimelineToolbarController />
      </ActionToolbarProvider>,
    );
    const toolbar = screen.getByRole('toolbar', { name: 'Timeline actions' });

    rerender(
      <ActionToolbarProvider>
        <StageToolbarController />
      </ActionToolbarProvider>,
    );

    expect(screen.getByRole('toolbar', { name: 'Stage editor actions' })).toBe(
      toolbar,
    );
    expect(
      screen.getByRole('button', { name: 'Finished Editing' }),
    ).toBeInTheDocument();
  });

  it('keeps the trailing page action on screen when the toolbar overflows', () => {
    const { rerender } = render(
      <ActionToolbarProvider>
        <TimelineToolbarController />
      </ActionToolbarProvider>,
    );
    const lane = screen.getByRole('toolbar', { name: 'Timeline actions' });
    let scrollLeft = 0;
    Object.defineProperty(lane, 'clientWidth', { get: () => 200 });
    Object.defineProperty(lane, 'scrollLeft', {
      get: () => scrollLeft,
      set: (next: number) => {
        scrollLeft = next;
      },
    });
    // The toolbar measures the lane's content from its segments' layout boxes,
    // and the segment arriving with the new route is a new element.
    const segmentWidth = vi
      .spyOn(HTMLElement.prototype, 'offsetWidth', 'get')
      .mockImplementation(function (this: HTMLElement) {
        return this.parentElement === lane ? 320 : 0;
      });

    try {
      rerender(
        <ActionToolbarProvider>
          <StageToolbarController />
        </ActionToolbarProvider>,
      );

      expect(scrollLeft).toBe(120);
    } finally {
      segmentWidth.mockRestore();
    }
  });

  it('animates the history toolbar into and out of the viewport', async () => {
    const { rerender } = render(
      <ActionToolbarProvider>
        <HistoryToolbarController visible={false} />
      </ActionToolbarProvider>,
    );

    expect(
      screen.queryByRole('toolbar', { name: 'History actions' }),
    ).toBeNull();

    rerender(
      <ActionToolbarProvider>
        <HistoryToolbarController visible />
      </ActionToolbarProvider>,
    );

    const historyToolbar = screen.getByRole('toolbar', {
      name: 'History actions',
    });
    const animatedContainer = historyToolbar.parentElement;
    expect(animatedContainer).not.toBeNull();
    expect(toolbarEnterExitMotion.hidden).toMatchObject({
      opacity: 0,
      y: 'calc(100% + 1.25rem)',
    });
    expect(toolbarEnterExitMotion.visible).toMatchObject({ opacity: 1, y: 0 });
    expect(vi.mocked(reduced)).toHaveBeenLastCalledWith(springs.pop, false);

    rerender(
      <ActionToolbarProvider>
        <HistoryToolbarController visible={false} />
      </ActionToolbarProvider>,
    );

    await waitForElementToBeRemoved(historyToolbar);
  });

  it('uses the same bottom transition for the main toolbar', async () => {
    const { rerender } = render(
      <ActionToolbarProvider>
        <TimelineToolbarController />
      </ActionToolbarProvider>,
    );
    const mainToolbar = screen.getByRole('toolbar', {
      name: 'Timeline actions',
    });

    expect(toolbarEnterExitMotion.hidden).toMatchObject({
      opacity: 0,
      y: 'calc(100% + 1.25rem)',
    });
    expect(vi.mocked(reduced)).toHaveBeenLastCalledWith(springs.pop, false);

    rerender(<ActionToolbarProvider>{null}</ActionToolbarProvider>);

    await waitForElementToBeRemoved(mainToolbar);
  });
});
