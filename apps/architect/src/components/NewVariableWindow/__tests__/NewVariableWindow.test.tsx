import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Capture the props DialogForm receives so the test can invoke the
// backdrop/Esc dismiss path (onClose) the same way the base-ui Dialog does,
// while still mounting a real form store around the fields.
const dialogFormSpy = vi.fn<(props: { onClose: () => void }) => void>();
vi.mock('~/components/DialogForm/DialogForm', async () => {
  const { default: FormStoreProvider } = await import(
    '@codaco/fresco-ui/form/store/formStoreProvider'
  );
  return {
    default: (props: { onClose: () => void; children?: ReactNode }) => {
      dialogFormSpy(props);
      return (
        <FormStoreProvider>
          <div data-testid="dialog-form">
            <button type="button" onClick={() => props.onClose()}>
              dismiss
            </button>
            {props.children}
          </div>
        </FormStoreProvider>
      );
    },
  };
});

vi.mock('~/components/EditorLayout', () => ({
  Section: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Subsection: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('~/components/Form/arrayFields/Options', () => ({
  default: () => null,
  minTwoOptions: () => undefined,
  completeOptions: () => undefined,
}));
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

const dispatchSpy = vi.fn();
vi.mock('~/ducks/hooks', () => ({
  useAppDispatch: () => dispatchSpy,
  useAppSelector: (selector: (state: unknown) => unknown) => selector({}),
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

const dirtyTheForm = () =>
  fireEvent.change(screen.getByRole('textbox', { name: 'Variable name' }), {
    target: { value: 'Nickname' },
  });

describe('NewVariableWindow dirty-guard on dismiss', () => {
  beforeEach(() => {
    dialogFormSpy.mockClear();
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
    let resolveDialog: ((value: boolean) => void) | undefined;
    openDialogSpy.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveDialog = resolve;
      }),
    );
    const onCancel = vi.fn();
    renderWindow(onCancel);
    dirtyTheForm();

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

// Variable names are NMTOKENs, so the characters safeName strips can never be
// typed into the field (redux-form's `normalize` prop before the migration).
describe('NewVariableWindow name normalisation', () => {
  it('drops characters a variable name cannot contain', () => {
    renderWindow(vi.fn());
    const input = screen.getByRole('textbox', { name: 'Variable name' });

    fireEvent.change(input, { target: { value: 'my.name[0]' } });

    expect(input).toHaveValue('myname0');
  });
});
