import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Capture the props InlineEditScreen receives so the test can invoke the
// backdrop/Esc dismiss path (onCancel) the same way the base-ui Dialog does.
const inlineEditScreenSpy = vi.fn<(props: { onCancel: () => void }) => void>();
vi.mock('~/components/InlineEditScreen', () => ({
  default: (props: { onCancel: () => void; children?: ReactNode }) => {
    inlineEditScreenSpy(props);
    return (
      <div data-testid="inline-edit-screen">
        <button type="button" onClick={() => props.onCancel()}>
          dismiss
        </button>
        {props.children}
      </div>
    );
  },
}));

vi.mock('~/components/EditorLayout', () => ({
  Section: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Subsection: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('redux-form', () => ({
  Field: () => <div data-testid="field" />,
  formValueSelector: () => () => 'text',
  isDirty: (form: string) => (state: { dirty: Record<string, boolean> }) =>
    state.dirty[form] ?? false,
}));

vi.mock('~/components/Form/ValidatedField', () => ({
  default: () => <div data-testid="validated-field" />,
}));
vi.mock('~/components/Form/Fields', () => ({ Text: () => null }));
vi.mock('~/components/Form/Fields/Select', () => ({ default: () => null }));
vi.mock('~/components/Options', () => ({ default: () => null }));
vi.mock('~/components/Options/LockedOptions', () => ({ default: () => null }));
vi.mock('~/selectors/codebook', () => ({ getVariablesForSubject: () => ({}) }));
vi.mock('~/ducks/modules/protocol/codebook', () => ({
  createVariableAsync: vi.fn(),
}));

const openDialogSpy = globalThis.__architectDialogMocks.openDialog;

type ChoiceDialogConfig = {
  type: string;
  intent?: string;
  description?: string;
};

// Router for the two useAppSelector calls: `type` value and the dirty flag.
let dirtyState: Record<string, boolean> = {};
const dispatchSpy = vi.fn();
vi.mock('~/ducks/hooks', () => ({
  useAppDispatch: () => dispatchSpy,
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ dirty: dirtyState }),
}));

import NewVariableWindow from '../NewVariableWindow';

const renderWindow = (onCancel: () => void) =>
  render(
    <NewVariableWindow
      show
      entity="node"
      type="person"
      onComplete={vi.fn()}
      onCancel={onCancel}
    />,
  );

describe('NewVariableWindow dirty-guard on dismiss', () => {
  beforeEach(() => {
    dirtyState = {};
    inlineEditScreenSpy.mockClear();
    openDialogSpy.mockClear();
    dispatchSpy.mockClear();
  });

  it('closes immediately when the form is pristine', () => {
    const onCancel = vi.fn();
    renderWindow(onCancel);

    fireEvent.click(screen.getByText('dismiss'));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(openDialogSpy).not.toHaveBeenCalled();
  });

  it('confirms before discarding when the form is dirty', async () => {
    dirtyState = { 'create-new-variable': true };
    let resolveDialog: ((value: boolean) => void) | undefined;
    openDialogSpy.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveDialog = resolve;
      }),
    );
    const onCancel = vi.fn();
    renderWindow(onCancel);

    fireEvent.click(screen.getByText('dismiss'));

    // Dismiss must NOT drop the in-progress variable directly.
    expect(onCancel).not.toHaveBeenCalled();

    // Instead a confirmation dialog is opened.
    expect(openDialogSpy).toHaveBeenCalledTimes(1);
    const config = openDialogSpy.mock.calls[0]![0] as ChoiceDialogConfig;
    expect(config.type).toBe('choice');
    expect(config.intent).toBe('warning');
    expect(config.description).toMatch(/unsaved changes/i);

    // Only on explicit confirm is the discard performed.
    expect(resolveDialog).toBeDefined();
    resolveDialog!(true);
    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1));
  });
});
