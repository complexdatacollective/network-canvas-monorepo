import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import { Fingerprint, KeyRound, RectangleEllipsis } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import { FormWithoutProvider } from '@codaco/fresco-ui/form/Form';
import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { FormSubmissionResult } from '@codaco/fresco-ui/form/store/types';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { AuthResult } from '~/lib/auth/api';
import { useAuth } from '~/lib/auth/AuthContext';
import { hasPasskeyWindowLimitation } from '~/lib/pwa/passkeyWindowLimitation';

import BiometricUnlockForm from './BiometricUnlockForm';
import PasswordUnlockField from './PasswordUnlockField';
import { PinUnlockForm } from './PinUnlockForm';
import { RecoverByResettingDialog } from './RecoverByResettingDialog';
import { UnlockEmblem } from './UnlockEmblem';
import { UnlockLayout } from './UnlockLayout';

type AuthenticationDialogBaseProps = {
  /** Whether the dialog is visible. */
  open?: boolean;
  /** Context-specific heading; the authentication method is read from AuthContext. */
  title: string;
  /** Context-specific guidance shown above the authentication control. */
  description: string;
  /** Offer the recovery route supported by the enrolled authentication method. */
  allowRecovery?: boolean;
  /** Allow recovery actions that permanently reset app data. */
  allowDestructiveRecovery?: boolean;
  /** Called after the selected authentication method succeeds. */
  onAuthenticated?: () => void;
};

type AuthenticationDialogCancellationProps =
  | {
      /** Show a Cancel action and allow Escape, close-button, and backdrop dismissal. */
      showCancel: true;
      /** Called for every cancel or dismiss action. Required when showCancel is true. */
      onCancel: () => void;
    }
  | {
      showCancel?: false;
      onCancel?: never;
    };

export type AuthenticationDialogProps = AuthenticationDialogBaseProps &
  AuthenticationDialogCancellationProps;

const RECOVERY_DESCRIPTION = 'Enter your recovery passphrase.';
const LIMITED_RECOVERY_DESCRIPTION =
  "Biometric authentication isn't available in this installed app. Enter your recovery passphrase instead.";

export function AuthenticationDialog(props: AuthenticationDialogProps) {
  const {
    open = true,
    title,
    description,
    allowRecovery = false,
    allowDestructiveRecovery = true,
    onAuthenticated,
  } = props;
  const showCancel = props.showCancel === true;
  const onCancel = props.showCancel ? props.onCancel : undefined;
  const auth = useAuth();
  const limited = hasPasskeyWindowLimitation();
  const formId = useId();
  const recoveryFormId = useId();
  const autoAttempted = useRef(false);
  const authenticationAttemptCycle = useRef(0);
  const biometricAttemptPending = useRef<symbol | null>(null);
  const mountedRef = useRef(false);
  const previousOpenRef = useRef(open);
  const openRef = useRef(open);
  const onAuthenticatedRef = useRef(onAuthenticated);
  const [biometricPending, setBiometricPending] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  openRef.current = open;
  onAuthenticatedRef.current = onAuthenticated;

  const isUnlock = auth.kind === 'locked';
  const authenticateWithPin = isUnlock
    ? auth.unlockWithPin
    : auth.verifyWithPin;
  const authenticateWithPassphrase = isUnlock
    ? auth.unlockWithPassphrase
    : auth.verifyWithPassphrase;
  const authenticateBiometric = isUnlock
    ? auth.unlockWithBiometric
    : auth.verifyBiometric;
  const authenticateWithRecovery = isUnlock
    ? auth.unlockWithRecovery
    : auth.verifyWithRecovery;

  const invalidatePendingAuthentication = useCallback(() => {
    authenticationAttemptCycle.current += 1;
    biometricAttemptPending.current = null;
  }, []);

  const invalidatePendingAuthenticationAndReset = useCallback(() => {
    invalidatePendingAuthentication();
    setBiometricPending(false);
  }, [invalidatePendingAuthentication]);

  const runAuthenticationAttempt = useCallback(
    async (
      authenticate: () => Promise<AuthResult>,
      beforeAuthenticated?: () => void,
    ): Promise<AuthResult> => {
      const attemptCycle = authenticationAttemptCycle.current;
      const result = await authenticate();
      const current =
        mountedRef.current &&
        openRef.current &&
        attemptCycle === authenticationAttemptCycle.current;

      if (result.ok && current) {
        beforeAuthenticated?.();
        onAuthenticatedRef.current?.();
      }

      return result;
    },
    [],
  );

  const attemptBiometric = useCallback(async (): Promise<AuthResult> => {
    if (biometricAttemptPending.current !== null) {
      return {
        ok: false,
        message: 'Biometric authentication is already in progress.',
      };
    }

    const pendingAttempt = Symbol('biometric-attempt');
    biometricAttemptPending.current = pendingAttempt;
    setBiometricPending(true);
    try {
      return await runAuthenticationAttempt(authenticateBiometric);
    } finally {
      if (biometricAttemptPending.current === pendingAttempt) {
        biometricAttemptPending.current = null;
        if (mountedRef.current) {
          setBiometricPending(false);
        }
      }
    }
  }, [authenticateBiometric, runAuthenticationAttempt]);

  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useLayoutEffect(() => {
    if (previousOpenRef.current === open) return;
    previousOpenRef.current = open;
    invalidatePendingAuthentication();
  }, [invalidatePendingAuthentication, open]);

  useEffect(() => {
    if (!open) {
      autoAttempted.current = false;
      setBiometricPending(false);
      setRecoveryOpen(false);
      setResetOpen(false);
      return;
    }

    setResetOpen(false);
    setRecoveryOpen(allowRecovery && auth.mode === 'biometric' && limited);
  }, [allowDestructiveRecovery, allowRecovery, auth.mode, limited, open]);

  useEffect(() => {
    if (
      (auth.kind !== 'locked' && auth.kind !== 'unlocked') ||
      auth.mode !== 'biometric' ||
      !open ||
      limited ||
      recoveryOpen ||
      autoAttempted.current
    ) {
      return;
    }

    autoAttempted.current = true;
    void attemptBiometric().catch(() => {});
  }, [attemptBiometric, auth.kind, auth.mode, limited, open, recoveryOpen]);

  if (
    (auth.kind !== 'locked' && auth.kind !== 'unlocked') ||
    auth.mode === 'none' ||
    auth.mode === undefined
  ) {
    return null;
  }

  const cancelAuthentication = () => {
    invalidatePendingAuthenticationAndReset();
    onCancel?.();
  };
  const openRecoveryDialog = () => {
    invalidatePendingAuthenticationAndReset();
    setRecoveryOpen(true);
  };
  const closeRecoveryDialog = () => {
    invalidatePendingAuthenticationAndReset();
    setRecoveryOpen(false);
  };
  const openResetDialog = () => {
    if (!allowDestructiveRecovery) return;
    invalidatePendingAuthenticationAndReset();
    setResetOpen(true);
  };
  const closeResetDialog = () => {
    invalidatePendingAuthenticationAndReset();
    setResetOpen(false);
  };
  const finishReset = () => {
    invalidatePendingAuthenticationAndReset();
    setResetOpen(false);
    setRecoveryOpen(false);
  };
  const cancelButton = showCancel ? (
    <Button type="button" onClick={cancelAuthentication}>
      Cancel
    </Button>
  ) : null;
  const recoveryButton = allowRecovery ? (
    auth.mode === 'biometric' ? (
      <Button type="button" color="secondary" onClick={openRecoveryDialog}>
        Recover with passphrase
      </Button>
    ) : allowDestructiveRecovery ? (
      <Button type="button" color="destructive" onClick={openResetDialog}>
        Recover by resetting
      </Button>
    ) : null
  ) : null;
  const dialogProps = {
    open: open && !recoveryOpen && !resetOpen,
    title,
    closeDialog: showCancel ? cancelAuthentication : undefined,
    dismissible: showCancel,
  };

  let authenticationDialog;

  if (auth.mode === 'pin') {
    authenticationDialog = (
      <FormStoreProvider>
        <Dialog
          {...dialogProps}
          footer={
            <>
              {recoveryButton}
              {cancelButton}
              <SubmitButton
                form={formId}
                submittingText="Unlocking…"
                className="phone-landscape:self-center"
                data-testid="unlock-submit"
              >
                Unlock
              </SubmitButton>
            </>
          }
        >
          <UnlockLayout
            emblem={<UnlockEmblem icon={KeyRound} seed="pin-unlock" />}
          >
            <BaseDialog.Description render={<Paragraph emphasis="muted" />}>
              {description}
            </BaseDialog.Description>
            <PinUnlockForm
              formId={formId}
              verifyPin={async (pin) => {
                return runAuthenticationAttempt(() => authenticateWithPin(pin));
              }}
            />
          </UnlockLayout>
        </Dialog>
      </FormStoreProvider>
    );
  } else if (auth.mode === 'passphrase') {
    authenticationDialog = (
      <FormStoreProvider>
        <Dialog
          {...dialogProps}
          footer={
            <>
              {recoveryButton}
              {cancelButton}
              <SubmitButton
                form={formId}
                submittingText="Unlocking…"
                className="phone-landscape:self-center"
                data-testid="unlock-submit"
              >
                Unlock
              </SubmitButton>
            </>
          }
        >
          <UnlockLayout
            emblem={
              <UnlockEmblem icon={RectangleEllipsis} seed="passphrase-unlock" />
            }
          >
            <BaseDialog.Description render={<Paragraph emphasis="muted" />}>
              {description}
            </BaseDialog.Description>
            <FormWithoutProvider
              id={formId}
              onSubmit={async (values): Promise<FormSubmissionResult> => {
                const phrase =
                  typeof values.passphrase === 'string'
                    ? values.passphrase
                    : '';
                const result = await runAuthenticationAttempt(() =>
                  authenticateWithPassphrase(phrase),
                );
                if (result.ok) {
                  return { success: true };
                }
                return {
                  success: false,
                  formErrors: [result.message ?? 'Incorrect passphrase.'],
                };
              }}
            >
              <PasswordUnlockField autoFocus />
            </FormWithoutProvider>
          </UnlockLayout>
        </Dialog>
      </FormStoreProvider>
    );
  } else {
    authenticationDialog = (
      <Dialog
        {...dialogProps}
        footer={
          recoveryButton || cancelButton ? (
            <>
              {recoveryButton}
              {cancelButton}
            </>
          ) : undefined
        }
      >
        <UnlockLayout
          emblem={<UnlockEmblem icon={Fingerprint} seed="biometric-unlock" />}
        >
          <BaseDialog.Description render={<Paragraph emphasis="muted" />}>
            {description}
          </BaseDialog.Description>
          <BiometricUnlockForm
            submitLabel="Unlock with biometrics"
            disabled={biometricPending}
            onSubmit={async () => {
              return attemptBiometric();
            }}
          />
        </UnlockLayout>
      </Dialog>
    );
  }

  return (
    <>
      {open && !recoveryOpen && !resetOpen ? authenticationDialog : null}
      {recoveryOpen && !resetOpen ? (
        <FormStoreProvider>
          <Dialog
            open
            title="Recover with passphrase"
            closeDialog={closeRecoveryDialog}
            footer={
              <>
                {allowDestructiveRecovery ? (
                  <Button
                    type="button"
                    color="destructive"
                    onClick={openResetDialog}
                  >
                    Recover by resetting
                  </Button>
                ) : null}
                <Button type="button" onClick={closeRecoveryDialog}>
                  Cancel
                </Button>
                <SubmitButton form={recoveryFormId} submittingText="Unlocking…">
                  Unlock
                </SubmitButton>
              </>
            }
          >
            <UnlockLayout
              emblem={
                <UnlockEmblem icon={RectangleEllipsis} seed="recovery-unlock" />
              }
            >
              <BaseDialog.Description render={<Paragraph emphasis="muted" />}>
                {limited ? LIMITED_RECOVERY_DESCRIPTION : RECOVERY_DESCRIPTION}
              </BaseDialog.Description>
              <FormWithoutProvider
                id={recoveryFormId}
                onSubmit={async (values): Promise<FormSubmissionResult> => {
                  const phrase =
                    typeof values.passphrase === 'string'
                      ? values.passphrase
                      : '';
                  const result = await runAuthenticationAttempt(
                    () => authenticateWithRecovery(phrase),
                    () => setRecoveryOpen(false),
                  );
                  if (result.ok) {
                    return { success: true };
                  }
                  return {
                    success: false,
                    formErrors: [result.message ?? 'Incorrect passphrase.'],
                  };
                }}
              >
                <PasswordUnlockField autoFocus />
              </FormWithoutProvider>
            </UnlockLayout>
          </Dialog>
        </FormStoreProvider>
      ) : null}
      <RecoverByResettingDialog
        open={allowRecovery && allowDestructiveRecovery && resetOpen}
        onCancel={closeResetDialog}
        onReset={finishReset}
      />
    </>
  );
}
