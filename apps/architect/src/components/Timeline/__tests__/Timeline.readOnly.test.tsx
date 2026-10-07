import { configureStore } from '@reduxjs/toolkit';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import { actionCreators as protocolActions } from '~/ducks/modules/activeProtocol';
import { rootReducer } from '~/ducks/modules/root';
import { ProtocolReadOnlyContext } from '~/hooks/useProtocolReadOnly';
import { getProtocol } from '~/selectors/protocol';
import { developmentProtocol } from '~/templates/development-protocol';

import Timeline from '../Timeline';

// The new-stage screen is a full wizard; what matters here is only whether the
// timeline asked for it to open, and where.
vi.mock('../../Screens/NewStageScreen', () => ({
  default: ({
    open,
    insertAtIndex,
  }: {
    open: boolean;
    insertAtIndex?: number;
  }) =>
    open ? (
      <div data-testid="new-stage-screen">{`insert at ${insertAtIndex}`}</div>
    ) : null,
}));

const makeStore = () => {
  const protocol = structuredClone(developmentProtocol);
  // The first three stages carry no skip logic, so no reorder or delete is
  // refused by the skip-destination guards and every outcome below is down to
  // the lock alone.
  protocol.stages = protocol.stages.slice(0, 3);
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, immutableCheck: false }),
  });
  store.dispatch(protocolActions.setActiveProtocol(protocol));
  return store;
};

const stageIds = (store: ReturnType<typeof makeStore>) =>
  getProtocol(store.getState())?.stages.map((stage) => stage.id);

const withReadOnly = (readOnly: boolean | null, tree: ReactNode) =>
  readOnly === null ? (
    tree
  ) : (
    <ProtocolReadOnlyContext value={readOnly}>{tree}</ProtocolReadOnlyContext>
  );

const renderTimeline = (readOnly: boolean | null) => {
  const store = makeStore();
  const tree = (
    <Provider store={store}>
      <Timeline />
    </Provider>
  );
  const { rerender } = render(withReadOnly(readOnly, tree));
  const setReadOnly = (next: boolean) => rerender(withReadOnly(next, tree));
  return { store, setReadOnly };
};

const nth = <T,>(items: readonly T[], index: number): T => {
  const item = items[index];
  if (item === undefined) throw new Error(`No item at ${index}`);
  return item;
};

const addAfterLastButton = () =>
  screen.getByRole('button', { name: 'Add new stage' });
// By label, not by role: an accessible name is empty for a node hidden from
// assistive technology, which is the very state under test.
const insertButtons = () => screen.queryAllByLabelText(/^Add stage here/);
const openControls = () =>
  within(screen.getByRole('list')).getAllByRole('button', {
    name: /^Edit stage/,
  });
const deleteControls = () =>
  screen.getAllByRole('button', { name: /^Delete stage/, hidden: true });

describe('Timeline while another tab owns the protocol', () => {
  it('cannot be added to', () => {
    renderTimeline(true);

    expect(addAfterLastButton()).toBeDisabled();
    fireEvent.click(addAfterLastButton());

    // One insertion point above each of the three stages, none of them
    // operable and none of them announced as a control.
    expect(insertButtons()).toHaveLength(3);
    for (const insert of insertButtons()) {
      expect(insert).toBeDisabled();
      expect(insert).toHaveAttribute('aria-hidden', 'true');
      fireEvent.click(insert);
    }
    const announced = screen
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'));
    expect(announced.some((label) => label?.startsWith('Add stage here'))).toBe(
      false,
    );
    expect(screen.queryByTestId('new-stage-screen')).not.toBeInTheDocument();
  });

  it('cannot be reordered from the keyboard', () => {
    const { store } = renderTimeline(true);
    const before = stageIds(store);

    fireEvent.keyDown(nth(openControls(), 0), { key: 'ArrowDown' });

    expect(stageIds(store)).toEqual(before);
  });

  it('cannot have a stage deleted', () => {
    const { store } = renderTimeline(true);
    const before = stageIds(store);

    const controls = deleteControls();
    expect(controls).toHaveLength(3);
    for (const control of controls) {
      expect(control).toBeDisabled();
      fireEvent.click(control);
    }

    expect(globalThis.__architectDialogMocks.confirm).not.toHaveBeenCalled();
    expect(stageIds(store)).toEqual(before);
  });

  it('closes a new-stage screen that was open when another tab took over', () => {
    const { setReadOnly } = renderTimeline(false);
    fireEvent.click(addAfterLastButton());
    expect(screen.getByTestId('new-stage-screen')).toBeInTheDocument();

    setReadOnly(true);
    expect(screen.queryByTestId('new-stage-screen')).not.toBeInTheDocument();

    // And it stays closed when this tab can edit again.
    setReadOnly(false);
    expect(screen.queryByTestId('new-stage-screen')).not.toBeInTheDocument();
  });

  it('still lets every stage be opened', () => {
    renderTimeline(true);

    expect(openControls()).toHaveLength(3);
    for (const control of openControls()) {
      expect(control).toBeEnabled();
    }
  });
});

describe('Timeline outside the guard', () => {
  it('opens the new-stage screen from the add control and from an insertion point', () => {
    renderTimeline(null);

    fireEvent.click(addAfterLastButton());
    expect(screen.getByTestId('new-stage-screen')).toHaveTextContent(
      'insert at 3',
    );

    expect(insertButtons()).toHaveLength(3);
    for (const insert of insertButtons()) {
      expect(insert).toBeEnabled();
      expect(insert).not.toHaveAttribute('aria-hidden');
    }
    fireEvent.click(nth(insertButtons(), 1));
    expect(screen.getByTestId('new-stage-screen')).toHaveTextContent(
      'insert at 1',
    );
  });

  it('moves a stage down from the keyboard', () => {
    const { store } = renderTimeline(null);
    const [firstId, secondId, ...rest] = stageIds(store) ?? [];

    fireEvent.keyDown(nth(openControls(), 0), { key: 'ArrowDown' });

    expect(stageIds(store)).toEqual([secondId, firstId, ...rest]);
  });

  it('deletes a stage once confirmed', async () => {
    const { store } = renderTimeline(null);
    const [firstId, ...rest] = stageIds(store) ?? [];

    const firstDelete = nth(deleteControls(), 0);
    expect(firstDelete).toBeEnabled();
    fireEvent.click(firstDelete);

    expect(globalThis.__architectDialogMocks.confirm).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(stageIds(store)).toEqual(rest));
    expect(stageIds(store)).not.toContain(firstId);
  });
});
