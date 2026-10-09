'use client';

import { Loader2 } from 'lucide-react';
import type React from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { flushSync } from 'react-dom';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import {
  AppErrorMessage,
  AppMessage,
  useAppIntl,
} from '@codaco/app-i18n/react';

import { Button } from '../Button';
import type { FieldValue } from '../form/Field/types';
import { FormWithoutProvider } from '../form/Form';
import useFormStore from '../form/hooks/useFormStore';
import FormStoreProvider, {
  FormStoreContext,
} from '../form/store/formStoreProvider';
import type { FormSubmitHandler } from '../form/store/types';
import SubmitButton from '../form/SubmitButton';
import Paragraph from '../typography/Paragraph';
import {
  asFinalFocusTarget,
  resolveFinalFocus,
  type FinalFocusTarget,
} from '../utils/finalFocus';
import { generatePublicId } from '../utils/generatePublicId';
import Dialog from './Dialog';
import type { DialogSize } from './DialogPopup';
import useWizardState from './useWizardState';

const messages = defineMessages({
  exitAndLoseProgress: {
    id: 'frescoUi.dialogProvider.exitAndLoseProgress',
    defaultMessage: 'Exit and lose progress',
    description:
      'Default confirm action of the dialog asking whether to abandon a wizard mid-way.',
  },
  continueEditing: {
    id: 'frescoUi.dialogProvider.continueEditing',
    defaultMessage: 'Continue editing',
    description:
      'Default cancel action of the dialog asking whether to abandon a wizard mid-way.',
  },
  areYouSure: {
    id: 'frescoUi.dialogProvider.areYouSure',
    defaultMessage: 'Are you sure?',
    description: 'Default title of a confirmation dialog.',
  },
  submit: {
    id: 'frescoUi.dialogProvider.submit',
    defaultMessage: 'Submit',
    description: 'Default submit action of a form dialog.',
  },
});

type BaseDialog = {
  id?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  intent?: 'default' | 'destructive' | 'success' | 'info' | 'warning';
  children?: React.ReactNode;
  className?: string;
  size?: DialogSize;
  /**
   * Where focus goes if the control that opened this dialog is gone by the time
   * it closes — the normal outcome of a destructive confirm, because the action
   * destroys the control that asked for it. The opener is preferred whenever it
   * survives (the Cancel branch), so this only has to answer "and if the thing
   * I was attached to no longer exists?".
   *
   * Prefer a function: it is resolved when focus is returned, not when the
   * dialog opens, so it can name an element rendered in between.
   */
  finalFocus?: FinalFocusTarget;
};

export type AcknowledgeDialog = BaseDialog & {
  type: 'acknowledge';
  actions: {
    primary: {
      label: React.ReactNode;
      value: true;
    };
  };
};

// Make a choice - no is a valid option
export type ChoiceDialog<P = unknown, S = unknown, C = null> = BaseDialog & {
  type: 'choice';
  intent: 'default' | 'destructive' | 'success' | 'info' | 'warning';
  actions: {
    primary: {
      label: React.ReactNode;
      value: P;
    };
    secondary?: {
      label: React.ReactNode;
      value: S;
    };
    cancel: {
      label: React.ReactNode;
      value: C;
    };
  };
};

export type CustomDialog = BaseDialog & {
  type: 'custom';
  footer?: React.ReactNode;
};

type FormDialog = BaseDialog & {
  type: 'form';
  submitLabel?: React.ReactNode;
  cancelLabel?: React.ReactNode;
  /**
   * Acts on the submitted values before the dialog closes. A failed result
   * keeps the dialog open with the values as entered and the result's errors
   * shown, so the submission can be retried; only a successful one closes the
   * dialog, which then resolves with the values. Without it, submitting
   * closes the dialog straight away. While it runs the dialog cannot be
   * cancelled or dismissed, so it never resolves as cancelled with the
   * submission still under way.
   */
  onSubmit?: FormSubmitHandler;
};

export type GetFieldValue = (fieldName: string) => FieldValue | undefined;

export type SkipContext = {
  data: Record<string, unknown>;
  getFieldValue: GetFieldValue;
};

export type WizardStep = {
  // A node (not just a string) so a step title can render live state — e.g. a
  // pedigree parent step whose heading reflects a framing chosen in an earlier
  // step. Rendered inside the dialog chrome, outside any step-content provider,
  // so a stateful title must carry its own context.
  title: React.ReactNode;
  description?: React.ReactNode;
  content: React.ComponentType;
  nextLabel?: React.ReactNode;
  backLabel?: React.ReactNode;
  skip?: (context: SkipContext) => boolean;
};

export type WizardDialog = BaseDialog & {
  type: 'wizard';
  steps: WizardStep[];
  progress?: React.ComponentType<{
    currentStep: number;
    totalSteps: number;
  }> | null;
  onFinish?: (data: Record<string, unknown>) => unknown;
  confirmCancel?: {
    title: React.ReactNode;
    description: React.ReactNode;
    primaryLabel?: React.ReactNode;
    cancelLabel?: React.ReactNode;
    intent?: 'default' | 'destructive' | 'success' | 'info' | 'warning';
  };
  cancelLabel?: React.ReactNode;
};

// Helper type to extract return type from a dialog
export type DialogReturnType<D> =
  | null
  | (D extends AcknowledgeDialog
      ? true
      : D extends ChoiceDialog<infer P, infer S, infer C>
        ? P | S | C
        : D extends FormDialog
          ? Record<string, FieldValue>
          : unknown);

export type AnyDialog =
  | AcknowledgeDialog
  | ChoiceDialog<unknown, unknown, unknown>
  | CustomDialog
  | FormDialog
  | WizardDialog;

type DialogState = AnyDialog & {
  id: string;
  resolveCallback: (value: unknown) => void;
  open: boolean;
  abortController: AbortController | null;
  onConfirmHandler: (() => void | Promise<void>) | null;
  /** See `ConfirmOptions.abortable`. */
  abortable?: boolean;
  error: React.ReactNode;
  /**
   * The control that was focused when this dialog was requested. Captured
   * synchronously at the call, BEFORE the microtask that renders the dialog —
   * by the time that runs, an action that disabled or replaced the trigger has
   * already moved focus, and the trail is cold.
   */
  opener: HTMLElement | null;
};

type ConfirmOptions = {
  /** Localized error guidance rendered while the confirm remains open for retry. */
  describeError?: (error: unknown) => React.ReactNode;
  /**
   * The confirmed action. When it returns a promise, the dialog stays open
   * until it settles: it closes as confirmed once the promise resolves, and
   * shows the error for a retry if it rejects.
   *
   * While the promise is pending the dialog cannot be cancelled or dismissed
   * (Cancel is disabled, the close button is hidden, and Escape and outside
   * presses are ignored), because cancelling would resolve the confirm as
   * cancelled while the action carried on and completed. Set `abortable` only
   * when the action really stops on `signal`.
   *
   * `signal` also aborts when the dialog is torn down without the user (the
   * provider unmounting, or `closeAllDialogs`), so an action can skip
   * follow-up work, such as state updates, that no longer has a dialog to
   * report to.
   */
  onConfirm: (signal: AbortSignal) => void | Promise<void>;
  /**
   * Keeps Cancel, the close button, Escape and outside presses available while
   * an async `onConfirm` is pending. Cancelling aborts `signal` and resolves
   * the confirm as cancelled (`false`, or `null` when dismissed).
   *
   * Only set this when `onConfirm` honours `signal`: once it aborts, nothing
   * the action has not already done may happen. Server actions, IPC calls and
   * storage writes that run to completion regardless are not abortable.
   */
  abortable?: boolean;
  title?: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel: React.ReactNode;
  cancelLabel?: React.ReactNode;
  intent?: 'default' | 'destructive' | 'warning';
  size?: DialogSize;
  /**
   * Where focus goes on the CONFIRM branch, where `onConfirm` has usually just
   * destroyed the control that opened this dialog. See `BaseDialog.finalFocus`.
   */
  finalFocus?: FinalFocusTarget;
};

export type DialogContextType = {
  closeDialog: <T = boolean>(id: string, value: T | null) => Promise<void>;
  openDialog: <D extends AnyDialog>(
    dialogProps: D,
  ) => Promise<DialogReturnType<D>>;
  confirm: (options: ConfirmOptions) => Promise<true | false | null>;
  // Dismiss every open dialog at once, resolving each pending promise with
  // `null` (the cancel value). For dismissing dialogs on a global state change
  // such as an auth lock, so a destructive confirm can't survive it.
  closeAllDialogs: () => void;
};

export const DialogContext = createContext<DialogContextType | null>(null);

/**
 * Where focus goes when `dialog` closes.
 *
 * Returned as a function so Base UI resolves it when focus is actually being
 * returned (after the exit animation), not when the dialog was rendered.
 *
 * Order matters. The opener wins whenever it is still in the document, which
 * covers Cancel, Escape, the backdrop and the close button. The caller's
 * fallback answers the confirm branch, where the action has just removed the
 * opener — an explicit `finalFocus` bypasses Base UI's own connectivity check,
 * so a destroyed opener would otherwise be focused as a detached node and leave
 * focus on `<body>`.
 *
 * `null` (never `undefined`) is what tells Base UI to fall back to its own
 * default; `undefined` suppresses focus return altogether.
 */
const getDialogFinalFocus = (dialog: DialogState) => () =>
  resolveFinalFocus(dialog.opener, dialog.finalFocus);

/**
 * Whether a confirm is running an action that leaving would not stop. Leaving
 * resolves the confirm as cancelled, which would be untrue while that action
 * is still going to complete, so Cancel and every dismissal are refused until
 * it settles. A confirm whose action honours its signal (`abortable`) stays
 * cancellable, as cancelling it really does stop the action.
 */
const isConfirmHeldOpen = (dialog: DialogState) =>
  dialog.abortController !== null && !dialog.abortable;

function WizardDialogContent({
  dialog,
  dialogId,
  guardedCloseDialog,
}: {
  dialog: DialogState & { type: 'wizard' };
  dialogId: string;
  guardedCloseDialog: (id: string, value: unknown) => Promise<void>;
}) {
  const formStoreApi = useContext(FormStoreContext)!;

  const getFieldValue: GetFieldValue = useCallback(
    (fieldName: string) =>
      formStoreApi.getState().getFieldState(fieldName)?.value,
    [formStoreApi],
  );

  const validateForm = useCallback(
    () => formStoreApi.getState().validateForm(),
    [formStoreApi],
  );

  const getFieldErrors = useCallback(
    () => formStoreApi.getState().errors.fieldErrors,
    [formStoreApi],
  );

  const getFormValues = useCallback(
    () => formStoreApi.getState().getFormValues(),
    [formStoreApi],
  );

  const wizardProps = useWizardState({
    dialog,
    dialogId,
    closeDialog: guardedCloseDialog,
    getFieldValue,
    validateForm,
    getFieldErrors,
    getFormValues,
  });

  if (!wizardProps) return null;

  return (
    <Dialog
      title={wizardProps.title}
      description={wizardProps.description}
      closeDialog={wizardProps.cancel}
      finalFocus={getDialogFinalFocus(dialog)}
      accent={dialog.intent}
      open={dialog.open}
      dismissible={!wizardProps.isBusy}
      footer={wizardProps.footer}
      className={dialog.className}
      size={dialog.size ?? 'editor'}
    >
      {wizardProps.children}
    </Dialog>
  );
}

function WizardDialogRenderer({
  dialog,
  closeDialog,
  openDialog,
}: {
  dialog: DialogState & { type: 'wizard' };
  closeDialog: DialogContextType['closeDialog'];
  openDialog: DialogContextType['openDialog'];
}) {
  const guardedCloseDialog = useCallback(
    async <T,>(id: string, value: T | null) => {
      if (value !== null || !dialog.confirmCancel) {
        await closeDialog(id, value);
        return;
      }

      const confirmed = await openDialog({
        type: 'choice',
        title: dialog.confirmCancel.title,
        description: dialog.confirmCancel.description,
        intent: dialog.confirmCancel.intent ?? 'default',
        actions: {
          primary: {
            label: dialog.confirmCancel.primaryLabel ?? (
              <AppMessage message={messages.exitAndLoseProgress} />
            ),
            value: true,
          },
          cancel: {
            label: dialog.confirmCancel.cancelLabel ?? (
              <AppMessage message={messages.continueEditing} />
            ),
            value: false,
          },
        },
      });

      if (confirmed === true) {
        await closeDialog(id, null);
      }
    },
    [closeDialog, openDialog, dialog.confirmCancel],
  );

  return (
    <FormStoreProvider>
      <WizardDialogContent
        dialog={dialog}
        dialogId={dialog.id}
        guardedCloseDialog={guardedCloseDialog}
      />
    </FormStoreProvider>
  );
}

function FormDialogContent({
  dialog,
  closeDialog,
}: {
  dialog: DialogState & { type: 'form' };
  closeDialog: DialogContextType['closeDialog'];
}) {
  const intl = useAppIntl();
  // Leaving resolves the dialog as cancelled, which would be untrue while a
  // submission is under way: whatever it writes still lands.
  const isSubmitting = useFormStore((state) => state.isSubmitting);
  const formId = `dialog-form-${dialog.id}`;
  const { onSubmit } = dialog;

  return (
    <Dialog
      title={dialog.title}
      description={dialog.description}
      closeDialog={() => closeDialog(dialog.id, null)}
      finalFocus={getDialogFinalFocus(dialog)}
      accent={dialog.intent}
      open={dialog.open}
      dismissible={!isSubmitting}
      footer={
        <>
          <Button
            onClick={() => closeDialog(dialog.id, null)}
            disabled={isSubmitting}
            data-testid="dialog-cancel"
          >
            {dialog.cancelLabel ?? intl.formatMessage(commonMessages.cancel)}
          </Button>
          <SubmitButton form={formId} data-testid="dialog-submit">
            {dialog.submitLabel ?? intl.formatMessage(messages.submit)}
          </SubmitButton>
        </>
      }
      className={dialog.className}
      size={dialog.size ?? 'editor'}
    >
      <FormWithoutProvider
        id={formId}
        onSubmit={async (values) => {
          if (onSubmit) {
            const result = await onSubmit(values);
            if (!result.success) return result;
          }
          void closeDialog(dialog.id, values);
          return { success: true };
        }}
      >
        {dialog.children}
      </FormWithoutProvider>
    </Dialog>
  );
}

const DialogProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [dialogs, setDialogs] = useState<DialogState[]>([]);
  const dialogsRef = useRef<DialogState[]>([]);
  const isMounted = useRef(true);
  // Confirms running an action that leaving would not stop, recorded the
  // moment the action starts rather than when the dialog next renders, so a
  // Cancel or dismissal in the same task as the confirming click is refused
  // too. The rendered state (`isConfirmHeldOpen`) only disables the controls.
  const heldOpenConfirms = useRef(new Set<string>());

  useEffect(() => {
    dialogsRef.current = dialogs;
  }, [dialogs]);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      for (const dialog of dialogsRef.current) {
        if (!dialog.open) continue;
        dialog.abortController?.abort();
        dialog.resolveCallback(null);
      }
      dialogsRef.current = [];
    };
  }, []);

  const openDialog = useCallback(
    <D extends AnyDialog>(dialogProps: D): Promise<DialogReturnType<D>> => {
      // Read BEFORE the deferral below — see DialogState.opener.
      const opener = asFinalFocusTarget(document.activeElement);

      return new Promise((resolveCallback) => {
        // Defer to a microtask so callers in React lifecycle methods (e.g.
        // useEffect mount handlers) don't trigger "flushSync was called from
        // inside a lifecycle method" — flushSync would otherwise execute while
        // the commit phase is still running.
        queueMicrotask(() => {
          if (!isMounted.current) {
            resolveCallback(null);
            return;
          }

          flushSync(() =>
            setDialogs((prevDialogs) => [
              ...prevDialogs,
              {
                onConfirmHandler: null,
                ...dialogProps,
                id: dialogProps.id ?? generatePublicId(),
                resolveCallback,
                open: true,
                abortController: null,
                error: null,
                opener,
              } as DialogState,
            ]),
          );
        });
      });
    },
    [],
  );

  const closeDialog = useCallback(
    async <T = boolean,>(id: string, value: T | null = null) => {
      let dialogToResolve: DialogState | undefined;

      // flushSync ensures the updater runs synchronously so that
      // dialogToResolve is assigned before the check below. Without it,
      // React 18's automatic batching may defer the updater (e.g. when
      // another setState like setDialogError was called in the same tick),
      // leaving dialogToResolve undefined.
      flushSync(() => {
        setDialogs((prevDialogs) => {
          const dialog = prevDialogs.find((d) => d.id === id);

          if (!dialog?.open) {
            return prevDialogs;
          }

          dialogToResolve = dialog;

          if (dialog.abortController) {
            dialog.abortController.abort();
          }

          return prevDialogs.map((d) =>
            d.id === id ? { ...d, open: false } : d,
          );
        });
      });

      if (!dialogToResolve) {
        return;
      }

      dialogToResolve.resolveCallback(value);

      await new Promise((resolve) => setTimeout(resolve, 500));

      if (!isMounted.current) return;

      setDialogs((prevDialogs) => prevDialogs.filter((d) => d.id !== id));
    },
    [],
  );

  const closeAllDialogs = useCallback(() => {
    // Defer to a microtask so this is safe to call from any lifecycle context
    // (e.g. an auth-lock useEffect) — flushSync must not run inside React's
    // commit phase. Mirrors openDialog's deferral above.
    queueMicrotask(() => {
      if (!isMounted.current) return;

      let toResolve: DialogState[] = [];
      // flushSync so `toResolve` is captured before we resolve/remove below,
      // mirroring closeDialog. Aborting in-flight confirm handlers here matches
      // closeDialog's teardown.
      flushSync(() => {
        setDialogs((prevDialogs) => {
          toResolve = prevDialogs.filter((d) => d.open);
          if (toResolve.length === 0) return prevDialogs;
          for (const d of toResolve) {
            d.abortController?.abort();
          }
          return prevDialogs.map((d) => (d.open ? { ...d, open: false } : d));
        });
      });

      if (toResolve.length === 0) return;

      for (const d of toResolve) {
        d.resolveCallback(null);
      }

      const closedIds = new Set(toResolve.map((d) => d.id));
      setTimeout(() => {
        if (!isMounted.current) return;

        setDialogs((prevDialogs) =>
          prevDialogs.filter((d) => !closedIds.has(d.id)),
        );
      }, 500);
    });
  }, []);

  const setDialogAbortController = useCallback(
    (id: string, abortController: AbortController | null) => {
      setDialogs((prevDialogs) =>
        prevDialogs.map((d) => (d.id === id ? { ...d, abortController } : d)),
      );
    },
    [],
  );

  const setDialogError = useCallback((id: string, error: React.ReactNode) => {
    setDialogs((prevDialogs) =>
      prevDialogs.map((d) => (d.id === id ? { ...d, error } : d)),
    );
  }, []);

  const confirm = useCallback(
    async (options: ConfirmOptions): Promise<true | false | null> => {
      const dialogId = generatePublicId();
      let isRunning = false;

      const handleConfirm = async () => {
        // A second confirming click before the first one's render has
        // disabled the button would run the action twice.
        if (isRunning) return;

        setDialogError(dialogId, null);

        const abortController = new AbortController();

        let maybePromise: void | Promise<void>;
        try {
          maybePromise = options.onConfirm(abortController.signal);
        } catch (e) {
          setDialogError(
            dialogId,
            options.describeError?.(e) ??
              (e instanceof Error ? (
                <AppErrorMessage error={e.message} />
              ) : (
                <AppMessage message={commonMessages.genericError} />
              )),
          );
          return;
        }

        if (!(maybePromise instanceof Promise)) {
          await closeDialog(dialogId, true);
          return;
        }

        isRunning = true;
        if (!options.abortable) heldOpenConfirms.current.add(dialogId);
        setDialogAbortController(dialogId, abortController);

        try {
          await maybePromise;
          heldOpenConfirms.current.delete(dialogId);
          await closeDialog(dialogId, true);
        } catch (e) {
          heldOpenConfirms.current.delete(dialogId);
          // Only an abort this dialog asked for means it has closed. Any other
          // rejection, an AbortError from the action's own timeout included,
          // is a failure to show, or a dialog that cannot be cancelled while
          // it waits would be left waiting for good.
          if (abortController.signal.aborted) {
            return;
          }

          setDialogAbortController(dialogId, null);
          setDialogError(
            dialogId,
            options.describeError?.(e) ??
              (e instanceof Error ? (
                <AppErrorMessage error={e.message} />
              ) : (
                <AppMessage message={commonMessages.genericError} />
              )),
          );
        } finally {
          isRunning = false;
        }
      };

      const result = await openDialog({
        id: dialogId,
        type: 'choice',
        title: options.title ?? <AppMessage message={messages.areYouSure} />,
        description: options.description,
        intent: options.intent ?? 'destructive',
        size: options.size,
        finalFocus: options.finalFocus,
        actions: {
          primary: { label: options.confirmLabel, value: true },
          cancel: {
            label: options.cancelLabel ?? (
              <AppMessage message={commonMessages.cancel} />
            ),
            value: false,
          },
        },
        onConfirmHandler: handleConfirm,
        abortable: options.abortable ?? false,
      } as ChoiceDialog<boolean, never, boolean> & {
        id: string;
        onConfirmHandler: () => void | Promise<void>;
        abortable: boolean;
      });

      return result ?? null;
    },
    [openDialog, closeDialog, setDialogAbortController, setDialogError],
  );

  const contextValue: DialogContextType = {
    closeDialog,
    openDialog,
    confirm,
    closeAllDialogs,
  };

  // Cancel, the close button, Escape and outside presses: the ways the person
  // using a dialog leaves it, as opposed to the caller closing it.
  const leaveDialog = (id: string, value: unknown = null) => {
    if (heldOpenConfirms.current.has(id)) return;
    void closeDialog(id, value);
  };

  const renderDialogActions = (dialog: DialogState) => {
    if (dialog.type === 'acknowledge') {
      // An acknowledge dialog has exactly one action, and it is the only way
      // out — so declare where focus starts instead of inheriting a default
      // nobody has verified. Base UI's default is "the first tabbable element
      // inside the popup", which here is the header's close button: a control
      // whose label says nothing about what just happened, and a default that
      // would move under us if the header ever gained another control.
      // `autoFocus` is how the choice dialog below already declares this.
      return (
        <Button
          color="primary"
          onClick={() => closeDialog(dialog.id, dialog.actions.primary.value)}
          autoFocus
          data-testid="dialog-primary"
        >
          {dialog.actions.primary.label}
        </Button>
      );
    }

    if (dialog.type === 'choice') {
      // Destructive/warning choices autofocus cancel so the discouraged
      // action requires deliberate navigation.
      const autoFocusButton: 'primary' | 'cancel' =
        dialog.intent === 'destructive' || dialog.intent === 'warning'
          ? 'cancel'
          : 'primary';

      const isLoading = dialog.abortController !== null;
      const isHeldOpen = isConfirmHeldOpen(dialog);

      const handlePrimaryClick = () => {
        if (dialog.onConfirmHandler) {
          void dialog.onConfirmHandler();
        } else {
          void closeDialog(dialog.id, dialog.actions.primary.value);
        }
      };

      return (
        <>
          {dialog.error && (
            <Paragraph
              intent="smallText"
              className="text-destructive-ink w-full"
            >
              {dialog.error}
            </Paragraph>
          )}
          {dialog.actions.cancel && (
            <Button
              onClick={() =>
                leaveDialog(dialog.id, dialog.actions.cancel.value)
              }
              autoFocus={autoFocusButton === 'cancel'}
              disabled={isHeldOpen}
              data-testid="dialog-cancel"
            >
              {dialog.actions.cancel.label}
            </Button>
          )}
          {dialog.actions.secondary && (
            <Button
              onClick={() =>
                closeDialog(dialog.id, dialog.actions.secondary!.value)
              }
              data-testid="dialog-secondary"
            >
              {dialog.actions.secondary.label}
            </Button>
          )}
          <Button
            color="primary"
            onClick={handlePrimaryClick}
            autoFocus={autoFocusButton === 'primary'}
            disabled={isLoading}
            icon={isLoading ? <Loader2 className="animate-spin" /> : undefined}
            data-testid="dialog-primary"
          >
            {dialog.actions.primary.label}
          </Button>
        </>
      );
    }

    return null;
  };

  const renderDialog = (dialog: DialogState) => {
    if (dialog.type === 'wizard') {
      return (
        <WizardDialogRenderer
          key={dialog.id}
          dialog={dialog}
          closeDialog={closeDialog}
          openDialog={openDialog}
        />
      );
    }

    if (dialog.type === 'form') {
      return (
        <FormStoreProvider key={dialog.id}>
          <FormDialogContent dialog={dialog} closeDialog={closeDialog} />
        </FormStoreProvider>
      );
    }

    const footer =
      dialog.type === 'custom' ? dialog.footer : renderDialogActions(dialog);

    return (
      <Dialog
        key={dialog.id}
        title={dialog.title}
        description={dialog.description}
        closeDialog={() => leaveDialog(dialog.id)}
        finalFocus={getDialogFinalFocus(dialog)}
        accent={dialog.intent}
        open={dialog.open}
        dismissible={!isConfirmHeldOpen(dialog)}
        footer={footer}
        className={dialog.className}
        size={dialog.size}
      >
        {dialog.children}
      </Dialog>
    );
  };

  return (
    <DialogContext.Provider value={contextValue}>
      {children}
      {dialogs.map(renderDialog)}
    </DialogContext.Provider>
  );
};

export default DialogProvider;
