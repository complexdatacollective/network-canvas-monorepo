import { fireEvent, render, screen } from '@testing-library/react';
import { Reorder } from 'motion/react';
import { describe, expect, it, vi } from 'vitest';

import { INTERFACE_NAMES } from '@codaco/protocol-builder/interfaces/interfaceNames';

import TimelineStageRow, { type TimelineRowStage } from '../TimelineStageRow';

const stages: TimelineRowStage[] = [
  {
    id: 'stage-1',
    type: 'Information',
    label: 'Consent',
    hasFilter: false,
    hasSkipLogic: false,
  },
  {
    id: 'stage-2',
    type: 'Information',
    label: 'Demographics',
    hasFilter: false,
    hasSkipLogic: false,
  },
];

type Handlers = {
  onOpen?: (stageId: string) => void;
  onMove?: (stageId: string, targetIndex: number) => boolean;
  onDelete?: (stageId: string) => void;
};

const acceptMove = () => true;

// The `<li>` mirrors Timeline.tsx: the row is not the list item. Each stage
// gets one `<li>` holding the insertion point above it and then this card, so
// that the `<ul>`'s children are the protocol's stages and nothing else.
const renderRow = (index: number, handlers: Handlers = {}) => {
  const stage = stages[index]!;
  return render(
    <Reorder.Group axis="y" values={stages} onReorder={vi.fn()}>
      <li>
        <TimelineStageRow
          stage={stage}
          index={index}
          stageCount={stages.length}
          onOpen={handlers.onOpen ?? vi.fn()}
          onMove={handlers.onMove ?? vi.fn(acceptMove)}
          onDelete={handlers.onDelete ?? vi.fn()}
          onDragCommit={vi.fn()}
          registerOpenControl={vi.fn()}
        />
      </li>
    </Reorder.Group>,
  );
};

describe('TimelineStageRow', () => {
  /**
   * Playwright's role engine implements no presentational-children rule, so an
   * end-to-end `getByRole('heading', …)` keeps matching an `<h4>` that has been
   * moved inside a `<button>` — where screen readers would no longer expose it
   * as a heading at all, and where the markup is invalid besides. Only a
   * structural assertion catches that, so it lives here.
   */
  it('keeps the stage label a heading outside the open control', () => {
    const { container } = renderRow(0);

    const heading = container.querySelector('h4');
    expect(heading).not.toBeNull();
    expect(heading).toHaveTextContent('Consent');
    expect(heading?.closest('button')).toBeNull();
    expect(
      screen.getByRole('heading', { level: 4, name: 'Consent' }),
    ).toBeInTheDocument();
  });

  it('opens the stage from a real button, so Enter and Space activate it', () => {
    const onOpen = vi.fn();
    renderRow(0, { onOpen });

    const openControl = screen.getByRole('button', {
      name: 'Edit stage 1: Consent, Information',
    });
    // The whole keyboard-activation fix rests on this being a native button
    // rather than the `<li tabIndex={0}>` it replaced: an `<li>` has no
    // activation behaviour, so Enter and Space do nothing on it.
    expect(openControl.tagName).toBe('BUTTON');
    expect(openControl).toHaveAttribute('type', 'button');

    fireEvent.click(openControl);
    expect(onOpen).toHaveBeenCalledWith('stage-1');
  });

  it('moves the stage down with ArrowDown from the preview control', () => {
    const onMove = vi.fn(acceptMove);
    renderRow(0, { onMove });

    fireEvent.keyDown(
      screen.getByRole('button', {
        name: 'Edit stage 1: Consent, Information',
      }),
      { key: 'ArrowDown' },
    );

    expect(onMove).toHaveBeenCalledWith('stage-1', 1);
  });

  it('moves the stage up with ArrowUp from the preview control', () => {
    const onMove = vi.fn(acceptMove);
    renderRow(1, { onMove });

    fireEvent.keyDown(
      screen.getByRole('button', {
        name: 'Edit stage 2: Demographics, Information',
      }),
      { key: 'ArrowUp' },
    );

    expect(onMove).toHaveBeenCalledWith('stage-2', 0);
  });

  it('ignores an arrow press that would run off either end of the list', () => {
    const onMoveFirst = vi.fn(acceptMove);
    const first = renderRow(0, { onMove: onMoveFirst });
    fireEvent.keyDown(
      screen.getByRole('button', {
        name: 'Edit stage 1: Consent, Information',
      }),
      { key: 'ArrowUp' },
    );
    expect(onMoveFirst).not.toHaveBeenCalled();
    first.unmount();

    const onMoveLast = vi.fn(acceptMove);
    renderRow(1, { onMove: onMoveLast });
    fireEvent.keyDown(
      screen.getByRole('button', {
        name: 'Edit stage 2: Demographics, Information',
      }),
      { key: 'ArrowDown' },
    );
    expect(onMoveLast).not.toHaveBeenCalled();
  });

  it('uses only the open and delete controls, with default Delete styling', () => {
    const onDelete = vi.fn();
    renderRow(1, { onDelete });

    const deleteControl = screen.getByRole('button', {
      name: 'Delete stage 2: Demographics',
    });
    expect(
      screen.queryByRole('button', { name: 'Reorder stage' }),
    ).not.toBeInTheDocument();
    expect(deleteControl).toHaveClass(
      'bg-(--component-text)',
      'text-(--component-bg)',
    );
    expect(deleteControl).not.toHaveClass('elevation-none');
    fireEvent.click(deleteControl);

    expect(onDelete).toHaveBeenCalledWith('stage-2');
  });

  /**
   * The interface name comes from `@codaco/protocol-builder`, keyed by the
   * schema's stage union — not from the New Stage screen's own option list,
   * which this row used to reach across into and which named six interfaces
   * differently from the stage editor registry.
   */
  it('names the interface from the shared interface-name map', () => {
    render(
      <Reorder.Group axis="y" values={stages} onReorder={vi.fn()}>
        <li>
          <TimelineStageRow
            stage={{ ...stages[0]!, type: 'TieStrengthCensus' }}
            index={0}
            stageCount={1}
            onOpen={vi.fn()}
            onMove={vi.fn(acceptMove)}
            onDelete={vi.fn()}
            onDragCommit={vi.fn()}
            registerOpenControl={vi.fn()}
          />
        </li>
      </Reorder.Group>,
    );

    expect(
      screen.getByRole('button', {
        name: `Edit stage 1: Consent, ${INTERFACE_NAMES.TieStrengthCensus}`,
      }),
    ).toBeInTheDocument();
  });

  /**
   * An imported protocol can name an interface this build has never heard of.
   * The row still has to render — and the open control still has to be
   * reachable and labelled — rather than taking the whole timeline down with
   * it, which is what a registry lookup that throws on an unknown type would
   * do here.
   */
  it('still renders a stage whose type this build does not know', () => {
    expect(() =>
      render(
        <Reorder.Group axis="y" values={stages} onReorder={vi.fn()}>
          <li>
            <TimelineStageRow
              stage={{ ...stages[0]!, type: 'SomeFutureInterface' }}
              index={0}
              stageCount={1}
              onOpen={vi.fn()}
              onMove={vi.fn(acceptMove)}
              onDelete={vi.fn()}
              onDragCommit={vi.fn()}
              registerOpenControl={vi.fn()}
            />
          </li>
        </Reorder.Group>,
      ),
    ).not.toThrow();

    expect(
      screen.getByRole('button', { name: 'Edit stage 1: Consent' }),
    ).toBeInTheDocument();
  });

  it('falls back to a readable name when a stage has no label', () => {
    render(
      <Reorder.Group axis="y" values={stages} onReorder={vi.fn()}>
        <li>
          <TimelineStageRow
            stage={{ ...stages[0]!, label: '' }}
            index={0}
            stageCount={1}
            onOpen={vi.fn()}
            onMove={vi.fn(acceptMove)}
            onDelete={vi.fn()}
            onDragCommit={vi.fn()}
            registerOpenControl={vi.fn()}
          />
        </li>
      </Reorder.Group>,
    );

    expect(
      screen.getByRole('button', {
        name: 'Edit stage 1: Untitled stage, Information',
      }),
    ).toBeInTheDocument();
  });
});
