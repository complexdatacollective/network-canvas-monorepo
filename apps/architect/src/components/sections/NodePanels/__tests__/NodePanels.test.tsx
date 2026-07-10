import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import {
  reducer as formReducer,
  reduxForm,
  type InjectedFormProps,
} from 'redux-form';
import { describe, expect, it, vi } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';

vi.mock('~/components/EditorLayout', () => ({
  Section: ({
    children,
    disabled,
    handleToggleChange,
  }: {
    children: ReactNode;
    disabled?: boolean;
    handleToggleChange?: (nextState: boolean) => boolean | Promise<boolean>;
  }) => (
    <section>
      <button
        type="button"
        disabled={disabled}
        onClick={() => void handleToggleChange?.(false)}
      >
        Disable panels
      </button>
      {children}
    </section>
  ),
}));

vi.mock('~/components/IssueAnchor', () => ({ default: () => null }));

vi.mock('../NodePanel', () => ({
  default: ({ fieldName }: { fieldName: string }) => <span>{fieldName}</span>,
}));

import type { NodePanelValue } from '../NodePanel';
import { handlePanelToggleChange, NodePanels } from '../NodePanels';

type FormValues = {
  panels: NodePanelValue[] | null;
  subject: { type: string };
};
type OwnProps = {
  panels: NodePanelValue[] | null;
};
type HarnessProps = InjectedFormProps<FormValues, OwnProps> & OwnProps;

const Harness = ({ panels }: HarnessProps) => (
  <NodePanels form="node-panels-test" panels={panels} />
);

const ReduxHarness = reduxForm<FormValues, OwnProps>({
  form: 'node-panels-test',
})(Harness);

const setup = (panels: NodePanelValue[] | null) => {
  const store = configureStore({
    reducer: { form: formReducer },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });

  render(
    <Provider store={store}>
      <DialogProvider>
        <ReduxHarness
          panels={panels}
          initialValues={{ panels, subject: { type: 'person' } }}
        />
      </DialogProvider>
    </Provider>,
  );

  const getPanels = () =>
    store.getState().form['node-panels-test']?.values?.panels as
      | NodePanelValue[]
      | null;

  return { getPanels };
};

const panel = (id: string): NodePanelValue => ({
  id,
  title: null,
  dataSource: 'existing',
  filter: null,
});

describe('NodePanels', () => {
  it('keeps null storage until add and creates at most two UUID-backed panels', () => {
    const { getPanels } = setup(null);

    expect(getPanels()).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add new panel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add new panel' }));

    expect(getPanels()).toEqual([
      {
        id: expect.any(String),
        title: null,
        dataSource: 'existing',
        filter: null,
      },
      {
        id: expect.any(String),
        title: null,
        dataSource: 'existing',
        filter: null,
      },
    ]);
    expect(getPanels()?.[0]?.id).not.toBe(getPanels()?.[1]?.id);
    expect(
      screen.queryByRole('button', { name: 'Add new panel' }),
    ).not.toBeInTheDocument();
  });

  it('keeps panel configuration when toggle removal is cancelled', async () => {
    const confirm = vi.fn(async () => false as const);
    const removePanels = vi.fn();

    await expect(
      handlePanelToggleChange(false, [panel('panel-1')], confirm, removePanels),
    ).resolves.toBe(false);
    expect(confirm).toHaveBeenCalledOnce();
    expect(removePanels).not.toHaveBeenCalled();
  });

  it('stores null when toggle removal is confirmed', async () => {
    const confirm = vi.fn(async () => true as const);
    let panels: NodePanelValue[] | null = [panel('panel-1')];

    await expect(
      handlePanelToggleChange(false, panels, confirm, () => {
        panels = null;
      }),
    ).resolves.toBe(true);
    expect(confirm).toHaveBeenCalledOnce();
    expect(panels).toBeNull();
  });

  it('does not confirm when enabling panels or removing an empty list', async () => {
    const confirm = vi.fn(async () => true as const);

    await expect(
      handlePanelToggleChange(true, [panel('panel-1')], confirm, vi.fn()),
    ).resolves.toBe(true);
    await expect(
      handlePanelToggleChange(false, [], confirm, vi.fn()),
    ).resolves.toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });
});
