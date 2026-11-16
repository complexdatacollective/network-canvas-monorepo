import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { useState } from 'react';
import { describe, expect, expectTypeOf, it } from 'vitest';

import Field from '../../form/Field/Field';
import InputField from '../../form/fields/InputField';
import type {
  FormSubmissionResult,
  FormSubmitHandler,
} from '../../form/store/types';
import type {
  AcknowledgeDialog,
  ChoiceDialog,
  CustomDialog,
  DialogReturnType,
} from '../DialogProvider';
import DialogProvider from '../DialogProvider';
import useDialog from '../useDialog';

describe('DialogReturnType', () => {
  it('is true | null for an acknowledge dialog', () => {
    expectTypeOf<DialogReturnType<AcknowledgeDialog>>().toEqualTypeOf<
      true | null
    >();
  });

  it('is the union of the action values, or null, for a choice dialog', () => {
    expectTypeOf<
      DialogReturnType<ChoiceDialog<'confirm', 'skip', 'cancel'>>
    >().toEqualTypeOf<'confirm' | 'skip' | 'cancel' | null>();
    expectTypeOf<
      DialogReturnType<ChoiceDialog<true, never, false>>
    >().toEqualTypeOf<boolean | null>();
  });

  it('is unknown for a custom dialog', () => {
    expectTypeOf<DialogReturnType<CustomDialog>>().toEqualTypeOf<unknown>();
  });
});

describe('Dialog type constraints', () => {
  it('requires intent on a choice dialog but not on an acknowledge dialog', () => {
    expectTypeOf<{ intent?: undefined }>().not.toExtend<
      Pick<ChoiceDialog, 'intent'>
    >();
    expectTypeOf<{ intent?: undefined }>().toExtend<
      Pick<AcknowledgeDialog, 'intent'>
    >();
  });
});

describe('DialogProvider', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(DialogProvider, null, children);

  describe('useDialog hook', () => {
    it('should throw error when used outside DialogProvider', () => {
      expect(() => {
        renderHook(() => useDialog());
      }).toThrow('useDialog must be used within a DialogProvider');
    });
  });

  describe('closeDialog', () => {
    it('should resolve the dialog promise with the provided value', async () => {
      const { result } = renderHook(() => useDialog(), { wrapper });

      let resolvedValue: boolean | null = null;
      let dialogId: string | undefined;

      await act(async () => {
        const dialogPromise = result.current.openDialog({
          id: 'test-dialog',
          type: 'acknowledge',
          title: 'Test',
          description: 'Test',
          actions: {
            primary: { label: 'OK', value: true },
          },
        });

        dialogId = 'test-dialog';

        // Close the dialog after it's opened
        setTimeout(async () => {
          await result.current.closeDialog(dialogId!, true);
        }, 10);

        resolvedValue = await dialogPromise;
      });

      expect(resolvedValue).toBe(true);
    });

    it('should resolve with null when closed without a value', async () => {
      const { result } = renderHook(() => useDialog(), { wrapper });

      let resolvedValue: boolean | null = true; // Start with non-null to verify it changes

      await act(async () => {
        const dialogPromise = result.current.openDialog({
          id: 'test-dialog-2',
          type: 'acknowledge',
          title: 'Test',
          description: 'Test',
          actions: {
            primary: { label: 'OK', value: true },
          },
        });

        setTimeout(async () => {
          await result.current.closeDialog('test-dialog-2', null);
        }, 10);

        resolvedValue = await dialogPromise;
      });

      expect(resolvedValue).toBeNull();
    });

    it('should silently return when closing non-existent dialog', async () => {
      const { result } = renderHook(() => useDialog(), { wrapper });

      // closeDialog silently returns for non-existent/already-closed dialogs
      // to prevent double-close race conditions
      await act(async () => {
        await expect(
          result.current.closeDialog('non-existent-id', true),
        ).resolves.toBeUndefined();
      });
    });
  });

  describe('closeAllDialogs', () => {
    // Regression: closeAllDialogs is invoked from a useEffect (auth lock) so it
    // must defer its flushSync to a microtask like openDialog. If it hangs, the
    // awaiting callers never resolve and these awaits time out.
    it('dismisses every open dialog, resolving each with null', async () => {
      const { result } = renderHook(() => useDialog(), { wrapper });

      let first: unknown = 'unset';
      let second: unknown = 'unset';

      await act(async () => {
        const p1 = result.current.openDialog({
          id: 'dlg-1',
          type: 'acknowledge',
          title: 'One',
          description: 'One',
          actions: { primary: { label: 'OK', value: true } },
        });
        const p2 = result.current.openDialog({
          id: 'dlg-2',
          type: 'choice',
          title: 'Two',
          description: 'Two',
          intent: 'destructive',
          actions: {
            primary: { label: 'Yes', value: true },
            cancel: { label: 'No', value: false },
          },
        });

        // Let both dialogs register (openDialog defers to a microtask), then
        // dismiss all at once.
        setTimeout(() => result.current.closeAllDialogs(), 10);
        [first, second] = await Promise.all([p1, p2]);
      });

      expect(first).toBeNull();
      expect(second).toBeNull();
    });

    it('is a no-op with no open dialogs and does not disturb a later dialog', async () => {
      const { result } = renderHook(() => useDialog(), { wrapper });

      let resolved: unknown = 'unset';
      await act(async () => {
        // closeAllDialogs with nothing open must not throw, and must not leave
        // the provider in a state that pre-resolves the next dialog: the dialog
        // opened right after still resolves with its OWN value, not null.
        result.current.closeAllDialogs();
        const later = result.current.openDialog({
          id: 'later',
          type: 'acknowledge',
          title: 'Later',
          description: 'Later',
          actions: { primary: { label: 'OK', value: true } },
        });
        setTimeout(() => void result.current.closeDialog('later', true), 10);
        resolved = await later;
      });

      expect(resolved).toBe(true);
    });
  });
});

describe('Dialog button actions', () => {
  const user = userEvent.setup();

  // Test component that opens dialogs and displays the result
  function TestDialogComponent({
    onResult,
  }: {
    onResult: (result: unknown) => void;
  }) {
    const { openDialog } = useDialog();
    const [lastResult, setLastResult] = useState<unknown>(undefined);

    const openAcknowledgeDialog = async () => {
      const result = await openDialog({
        type: 'acknowledge',
        title: 'Acknowledge Test',
        description: 'Click OK to continue',
        actions: {
          primary: { label: 'OK', value: true },
        },
      });
      setLastResult(result);
      onResult(result);
    };

    const openChoiceDialog = async () => {
      const result = await openDialog({
        type: 'choice',
        title: 'Choice Test',
        description: 'Make a choice',
        intent: 'default',
        actions: {
          primary: { label: 'Confirm', value: 'confirmed' },
          secondary: { label: 'Maybe', value: 'maybe' },
          cancel: { label: 'Cancel', value: 'cancelled' },
        },
      });
      setLastResult(result);
      onResult(result);
    };

    return (
      <div>
        <button type="button" onClick={openAcknowledgeDialog}>
          Open Acknowledge
        </button>
        <button type="button" onClick={openChoiceDialog}>
          Open Choice
        </button>
        <div data-testid="result">
          {lastResult === undefined ? 'No result' : JSON.stringify(lastResult)}
        </div>
      </div>
    );
  }

  it('should return primary value when clicking primary button in acknowledge dialog', async () => {
    let capturedResult: unknown;
    const handleResult = (result: unknown) => {
      capturedResult = result;
    };

    render(
      <DialogProvider>
        <TestDialogComponent onResult={handleResult} />
      </DialogProvider>,
    );

    // Open the acknowledge dialog
    await user.click(screen.getByText('Open Acknowledge'));

    // Wait for dialog to appear and click OK
    const okButton = await screen.findByRole('button', { name: 'OK' });
    await user.click(okButton);
    await waitFor(() => expect(capturedResult).toBe(true));
  });

  it('should return primary value when clicking primary button in choice dialog', async () => {
    let capturedResult: unknown;
    const handleResult = (result: unknown) => {
      capturedResult = result;
    };

    render(
      <DialogProvider>
        <TestDialogComponent onResult={handleResult} />
      </DialogProvider>,
    );

    await user.click(screen.getByText('Open Choice'));

    const confirmButton = await screen.findByRole('button', {
      name: 'Confirm',
    });
    await user.click(confirmButton);

    await waitFor(() => expect(capturedResult).toBe('confirmed'));
  });

  it('should return secondary value when clicking secondary button in choice dialog', async () => {
    let capturedResult: unknown;
    const handleResult = (result: unknown) => {
      capturedResult = result;
    };

    render(
      <DialogProvider>
        <TestDialogComponent onResult={handleResult} />
      </DialogProvider>,
    );

    await user.click(screen.getByText('Open Choice'));

    const maybeButton = await screen.findByRole('button', { name: 'Maybe' });
    await user.click(maybeButton);

    await waitFor(() => expect(capturedResult).toBe('maybe'));
  });

  it('should return cancel value when clicking cancel button in choice dialog', async () => {
    let capturedResult: unknown;
    const handleResult = (result: unknown) => {
      capturedResult = result;
    };

    render(
      <DialogProvider>
        <TestDialogComponent onResult={handleResult} />
      </DialogProvider>,
    );

    await user.click(screen.getByText('Open Choice'));

    const cancelButton = await screen.findByRole('button', { name: 'Cancel' });
    await user.click(cancelButton);

    await waitFor(() => expect(capturedResult).toBe('cancelled'));
  });

  it('should return null when dialog is closed via closeDialog without a value', async () => {
    let capturedResult: unknown = 'not-set';
    let closeDialogRef: ((id: string, value: unknown) => Promise<void>) | null =
      null;

    function TestCloseWithNull({
      onResult,
    }: {
      onResult: (r: unknown) => void;
    }) {
      const { openDialog, closeDialog } = useDialog();
      closeDialogRef = closeDialog;

      const handleOpen = async () => {
        const result = await openDialog({
          id: 'test-null-close',
          type: 'acknowledge',
          title: 'Test',
          description: 'Test',
          actions: { primary: { label: 'OK', value: true } },
        });
        onResult(result);
      };

      return (
        <button type="button" onClick={handleOpen}>
          Test
        </button>
      );
    }

    render(
      <DialogProvider>
        <TestCloseWithNull onResult={(r) => (capturedResult = r)} />
      </DialogProvider>,
    );

    // Open the dialog
    await user.click(screen.getByText('Test'));

    await screen.findByRole('dialog');

    // Close with null (simulating backdrop click or escape)
    await act(async () => {
      await closeDialogRef?.('test-null-close', null);
    });
    await waitFor(() => expect(capturedResult).toBeNull());
  });
});

describe('confirm with async onConfirm', () => {
  function AsyncConfirmTestComponent({
    onResult,
    onConfirmFn,
    abortable,
  }: {
    onResult: (result: unknown) => void;
    onConfirmFn: (signal: AbortSignal) => void | Promise<void>;
    abortable?: boolean;
  }) {
    const { confirm } = useDialog();

    const handleClick = async () => {
      const result = await confirm({
        title: 'Async Confirm',
        description: 'This will run an async action',
        confirmLabel: 'Run Action',
        cancelLabel: 'Cancel',
        onConfirm: onConfirmFn,
        abortable,
      });
      onResult(result);
    };

    return (
      <button type="button" onClick={handleClick}>
        Open Async Confirm
      </button>
    );
  }

  it('refuses a Cancel made in the same task as the confirming click, and runs the action once', async () => {
    const user = userEvent.setup();
    let capturedResult: unknown = 'not-set';
    let finishWork: () => void = () => undefined;
    let runs = 0;

    render(
      <DialogProvider>
        <AsyncConfirmTestComponent
          onResult={(r) => (capturedResult = r)}
          onConfirmFn={() =>
            new Promise<void>((resolve) => {
              runs += 1;
              finishWork = resolve;
            })
          }
        />
      </DialogProvider>,
    );

    await user.click(
      screen.getByRole('button', { name: 'Open Async Confirm' }),
    );
    const run = await screen.findByRole('button', { name: 'Run Action' });
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    // Before React renders the pending state, so neither button is disabled.
    act(() => {
      run.click();
      run.click();
      cancel.click();
    });
    // Longer than the 500 ms close delay, so a Cancel that was honoured would
    // have resolved the confirm by now.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
    });
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(capturedResult).toBe('not-set');
    expect(runs).toBe(1);

    await act(async () => {
      finishWork();
    });
    await waitFor(() => expect(capturedResult).toBe(true));
  });

  it('can be cancelled again once a failed action has settled', async () => {
    const user = userEvent.setup();
    let capturedResult: unknown = 'not-set';
    let failWork: () => void = () => undefined;

    render(
      <DialogProvider>
        <AsyncConfirmTestComponent
          onResult={(r) => (capturedResult = r)}
          onConfirmFn={() =>
            new Promise<void>((_resolve, reject) => {
              failWork = () => reject(new Error('Not deleted.'));
            })
          }
        />
      </DialogProvider>,
    );

    await user.click(
      screen.getByRole('button', { name: 'Open Async Confirm' }),
    );
    await user.click(await screen.findByRole('button', { name: 'Run Action' }));
    expect(
      await screen.findByRole('button', { name: 'Cancel' }),
    ).toBeDisabled();

    await act(async () => {
      failWork();
    });
    expect(await screen.findByText('Not deleted.')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(capturedResult).toBe(false));
  });

  it('shows an AbortError the dialog did not cause as a failure, so the dialog is not left waiting', async () => {
    const user = userEvent.setup();

    render(
      <DialogProvider>
        <AsyncConfirmTestComponent
          onResult={() => undefined}
          onConfirmFn={async () => {
            await Promise.resolve();
            throw new DOMException('The request timed out', 'AbortError');
          }}
        />
      </DialogProvider>,
    );

    await user.click(
      screen.getByRole('button', { name: 'Open Async Confirm' }),
    );
    await user.click(await screen.findByRole('button', { name: 'Run Action' }));

    expect(
      await screen.findByText('Something went wrong.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Run Action' })).toBeEnabled();
  });

  it('aborts an abortable action and resolves as dismissed on Escape', async () => {
    const user = userEvent.setup();
    let capturedResult: unknown = 'not-set';
    let aborted = false;

    render(
      <DialogProvider>
        <AsyncConfirmTestComponent
          onResult={(r) => (capturedResult = r)}
          abortable
          onConfirmFn={(signal) =>
            new Promise<void>((_resolve, reject) => {
              signal.addEventListener('abort', () => {
                aborted = true;
                reject(new DOMException('Aborted', 'AbortError'));
              });
            })
          }
        />
      </DialogProvider>,
    );

    await user.click(
      screen.getByRole('button', { name: 'Open Async Confirm' }),
    );
    await user.click(await screen.findByRole('button', { name: 'Run Action' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Run Action' })).toBeDisabled(),
    );
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();

    await user.keyboard('{Escape}');

    await waitFor(() => expect(capturedResult).toBeNull());
    expect(aborted).toBe(true);
  });

  it('should show error message when async onConfirm throws', async () => {
    const user = userEvent.setup();

    render(
      <DialogProvider>
        <AsyncConfirmTestComponent
          onResult={() => undefined}
          onConfirmFn={() => {
            throw new Error('Network request failed');
          }}
        />
      </DialogProvider>,
    );

    await user.click(
      screen.getByRole('button', { name: 'Open Async Confirm' }),
    );

    const runButton = await screen.findByRole('button', { name: 'Run Action' });
    await user.click(runButton);

    expect(
      await screen.findByText('Network request failed'),
    ).toBeInTheDocument();

    const retryButton = screen.getByRole('button', { name: 'Run Action' });
    expect(retryButton).not.toBeDisabled();
  });

  it('should return false when user cancels before confirming', async () => {
    const user = userEvent.setup();
    let capturedResult: unknown = 'not-set';

    render(
      <DialogProvider>
        <AsyncConfirmTestComponent
          onResult={(r) => (capturedResult = r)}
          onConfirmFn={() => undefined}
        />
      </DialogProvider>,
    );

    await user.click(
      screen.getByRole('button', { name: 'Open Async Confirm' }),
    );

    const cancelButton = await screen.findByRole('button', { name: 'Cancel' });
    await user.click(cancelButton);

    await waitFor(() => expect(capturedResult).toBe(false));
  });

  it('should work with sync onConfirm', async () => {
    const user = userEvent.setup();
    let capturedResult: unknown = 'not-set';
    let callbackCalled = false;

    render(
      <DialogProvider>
        <AsyncConfirmTestComponent
          onResult={(r) => (capturedResult = r)}
          onConfirmFn={() => {
            callbackCalled = true;
          }}
        />
      </DialogProvider>,
    );

    await user.click(
      screen.getByRole('button', { name: 'Open Async Confirm' }),
    );

    const runButton = await screen.findByRole('button', { name: 'Run Action' });
    await user.click(runButton);

    await waitFor(() => expect(capturedResult).toBe(true));
    expect(callbackCalled).toBe(true);
  });
});

describe('form dialog onSubmit', () => {
  function FormDialogTestComponent({
    onResult,
    onSubmit,
  }: {
    onResult: (result: unknown) => void;
    onSubmit?: FormSubmitHandler;
  }) {
    const { openDialog } = useDialog();

    const handleClick = async () => {
      onResult(
        await openDialog({
          type: 'form',
          title: 'Rename',
          children: <Field component={InputField} name="name" label="Name" />,
          onSubmit,
        }),
      );
    };

    return (
      <button type="button" onClick={handleClick}>
        Open Form
      </button>
    );
  }

  it('keeps the dialog open with the values and the error when the submission is refused, and closes once it succeeds', async () => {
    const user = userEvent.setup();
    let capturedResult: unknown = 'not-set';
    let accept = false;

    render(
      <DialogProvider>
        <FormDialogTestComponent
          onResult={(r) => (capturedResult = r)}
          onSubmit={async () =>
            accept
              ? { success: true }
              : { success: false, formErrors: ['The name was not saved.'] }
          }
        />
      </DialogProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Open Form' }));
    await user.type(await screen.findByRole('textbox'), 'Alice');
    await user.click(screen.getByTestId('dialog-submit'));

    expect(await screen.findByText('The name was not saved.')).toBeVisible();
    expect(screen.getByRole('textbox')).toHaveValue('Alice');
    expect(capturedResult).toBe('not-set');

    accept = true;
    await user.click(screen.getByTestId('dialog-submit'));
    await waitFor(() => expect(capturedResult).toEqual({ name: 'Alice' }));
  });

  it('cannot be cancelled or dismissed while the submission is under way', async () => {
    const user = userEvent.setup();
    let capturedResult: unknown = 'not-set';
    const pending: ((result: FormSubmissionResult) => void)[] = [];

    render(
      <DialogProvider>
        <FormDialogTestComponent
          onResult={(r) => (capturedResult = r)}
          onSubmit={() =>
            new Promise((resolve) => {
              pending.push(resolve);
            })
          }
        />
      </DialogProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Open Form' }));
    await user.type(await screen.findByRole('textbox'), 'Alice');
    await user.click(screen.getByTestId('dialog-submit'));
    await waitFor(() => expect(pending).toHaveLength(1));

    expect(screen.getByTestId('dialog-cancel')).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Close' }),
    ).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    await user.click(screen.getByTestId('dialog-cancel'));
    // Longer than the 500 ms close delay, so a dismissal that was honoured
    // would have resolved the dialog by now.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
    });
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(capturedResult).toBe('not-set');

    // Once a refused submission settles the participant may leave again.
    await act(async () => {
      pending[0]?.({ success: false, formErrors: ['Not saved.'] });
    });
    expect(await screen.findByText('Not saved.')).toBeVisible();
    await user.click(screen.getByTestId('dialog-cancel'));
    await waitFor(() => expect(capturedResult).toBeNull());
  });

  it('closes with the values on submit when no onSubmit is given', async () => {
    const user = userEvent.setup();
    let capturedResult: unknown = 'not-set';

    render(
      <DialogProvider>
        <FormDialogTestComponent onResult={(r) => (capturedResult = r)} />
      </DialogProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Open Form' }));
    await user.type(await screen.findByRole('textbox'), 'Alice');
    await user.click(screen.getByTestId('dialog-submit'));
    await waitFor(() => expect(capturedResult).toEqual({ name: 'Alice' }));
  });
});
