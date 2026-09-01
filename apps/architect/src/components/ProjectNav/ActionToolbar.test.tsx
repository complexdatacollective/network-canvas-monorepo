import {
  render,
  screen,
  waitForElementToBeRemoved,
} from '@testing-library/react';
import { useMemo } from 'react';
import { describe, expect, it } from 'vitest';

import {
  ToolbarButton,
  ToolbarGroup,
  ToolbarIconButton,
} from '@codaco/fresco-ui/SegmentedToolbar';

import {
  ActionToolbarProvider,
  toolbarEnterExitMotion,
  toolbarEnterExitSpring,
  useActionToolbar,
} from './ActionToolbar';

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
    expect(toolbarEnterExitSpring).toMatchObject({
      type: 'spring',
      damping: 24,
    });

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
    expect(toolbarEnterExitSpring.damping).toBe(24);

    rerender(<ActionToolbarProvider>{null}</ActionToolbarProvider>);

    await waitForElementToBeRemoved(mainToolbar);
  });
});
