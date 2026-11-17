'use client';

import {
  browserSupportsWebAuthn,
  startAuthentication,
} from '@simplewebauthn/browser';
import { ArrowLeft, KeyRound, LockIcon, User2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import { AppErrorMessage, useAppIntl } from '@codaco/app-i18n/react';
import { Button } from '@codaco/fresco-ui/Button';
import { DialogFooter } from '@codaco/fresco-ui/dialogs/Dialog';
import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import PasswordField from '@codaco/fresco-ui/form/fields/PasswordField';
import SegmentedCodeField from '@codaco/fresco-ui/form/fields/SegmentedCodeField';
import Form from '@codaco/fresco-ui/form/Form';
import { type FormSubmitHandler } from '@codaco/fresco-ui/form/store/types';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import useHasHydrated from '@codaco/fresco-ui/hooks/useHasHydrated';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { login, recoveryCodeLogin, type LoginResult } from '~/actions/auth';
import { verifyTwoFactor } from '~/actions/twoFactor';
import {
  generateAuthenticationOptions,
  verifyAuthentication,
} from '~/actions/webauthn';
import { describePasskeyCeremonyError } from '~/i18n/passkeyCeremony';
import { TWO_FACTOR_SETUP_PATH } from '~/lib/auth/paths';
import { createAuthSchemas } from '~/schemas/auth';

const messages = defineMessages({
  signingIn: {
    id: 'fresco.SignInForm.signingIn',
    defaultMessage: 'Signing in...',
    description:
      'Text on the submit button of the username and password sign-in form while the sign-in request is being processed.',
  },

  verifying: {
    id: 'fresco.SignInForm.verifying',
    defaultMessage: 'Verifying...',
    description:
      'Text on the submit button while the two-factor code or recovery code entered during sign-in is being checked.',
  },

  requiredCode: {
    id: 'fresco.SignInForm.requiredCode',
    defaultMessage: 'Code is required',
    description:
      'Validation error under the 6-digit authenticator code field of the two-factor sign-in step when it is left empty.',
  },

  requiredRecovery: {
    id: 'fresco.SignInForm.requiredRecovery',
    defaultMessage: 'Recovery code is required',
    description:
      'Validation error under the recovery code field, in the recovery code sign-in form or the two-factor step, when it is left empty.',
  },

  requiredUsername: {
    id: 'fresco.SignInForm.requiredUsername',
    defaultMessage: 'Username is required',
    description:
      'Validation error under the username field of the recovery code sign-in form when it is left empty.',
  },

  copyTooManyAttemptsTryAgainInSeconds: {
    id: 'fresco.SignInForm.copyTooManyAttemptsTryAgainInSeconds',
    defaultMessage:
      'Too many attempts. Try again in {value1, plural, one {# second} other {# seconds}}.',
    description:
      'Error shown above the sign-in form when too many failed attempts have temporarily locked sign-in. value1 is the number of seconds to wait.',
  },
  copyCodeIsRequired: {
    id: 'fresco.SignInForm.copyCodeIsRequired',
    defaultMessage: 'Code is required',
    description:
      'Error shown on the code field of the two-factor sign-in step when the form is submitted without a code, by either the authenticator app or recovery code variant.',
  },
  copyVerificationFailed: {
    id: 'fresco.SignInForm.copyVerificationFailed',
    defaultMessage: 'Verification failed',
    description:
      'Generic error shown on the two-factor sign-in step when checking the code fails and the server gave no more specific reason.',
  },
  copyFailedToStartPasskeyAuthentication: {
    id: 'fresco.SignInForm.copyFailedToStartPasskeyAuthentication',
    defaultMessage: 'Failed to start passkey authentication',
    description:
      'Error shown under the passkey sign-in button when the server could not prepare the passkey sign-in request.',
  },
  copyPasskeyAuthenticationFailed: {
    id: 'fresco.SignInForm.copyPasskeyAuthenticationFailed',
    defaultMessage: 'Passkey authentication failed',
    description:
      'Fallback error shown under the passkey sign-in button when signing in with a passkey fails for a reason that has no more specific message.',
  },
  copyUsernameAndRecoveryCodeAreRequired: {
    id: 'fresco.SignInForm.copyUsernameAndRecoveryCodeAreRequired',
    defaultMessage: 'Username and recovery code are required',
    description:
      'Error shown above the recovery code sign-in form when it is submitted without a username or without a recovery code.',
  },
  copyUseAuthenticatorAppInstead: {
    id: 'fresco.SignInForm.copyUseAuthenticatorAppInstead',
    defaultMessage: 'Use authenticator app instead',
    description:
      'Link-style button on the two-factor sign-in step, shown while asking for a recovery code; switches back to entering the 6-digit code from the authenticator app.',
  },
  copyUseARecoveryCodeInstead: {
    id: 'fresco.SignInForm.copyUseARecoveryCodeInstead',
    defaultMessage: 'Use a recovery code instead',
    description:
      'Link-style button on the two-factor sign-in step, shown while asking for an authenticator app code; switches to entering a recovery code instead.',
  },
  copyTryAgainInS: {
    id: 'fresco.SignInForm.copyTryAgainInS',
    defaultMessage:
      'Try again in {value1, plural, one {# second} other {# seconds}}',
    description:
      'Text on the disabled submit button of the sign-in form while sign-in is temporarily locked after too many failed attempts. value1 is the number of seconds left.',
  },
  copySignIn: {
    id: 'fresco.SignInForm.copySignIn',
    defaultMessage: 'Sign in',
    description:
      'Text on the submit button of the username and password sign-in form.',
  },
  copyWaitingForPasskey: {
    id: 'fresco.SignInForm.copyWaitingForPasskey',
    defaultMessage: 'Waiting for passkey...',
    description:
      'Text on the passkey sign-in button while the browser is waiting for the researcher to approve the sign-in with their passkey.',
  },
  copySignInWithAPasskey: {
    id: 'fresco.SignInForm.copySignInWithAPasskey',
    defaultMessage: 'Sign in with a passkey',
    description:
      'Button below the sign-in form that signs the researcher in with a passkey (biometrics or device security) instead of a password.',
  },
  username: {
    id: 'fresco.SignInForm.username',
    defaultMessage: 'Username',
    description:
      'Label of the username field in the sign-in form and the recovery code sign-in form.',
  },
  enterYourUsername: {
    id: 'fresco.SignInForm.enterYourUsername',
    defaultMessage: 'Enter your username',
    description:
      'Placeholder inside the username field, and the hint under it, in the sign-in form and the recovery code sign-in form.',
  },
  recoveryCode: {
    id: 'fresco.SignInForm.recoveryCode',
    defaultMessage: 'Recovery code',
    description:
      'Label of the field where the researcher types one of the recovery codes saved when they set up two-factor authentication, in the recovery code sign-in form.',
  },
  example0123456789abcdef0123: {
    id: 'fresco.SignInForm.0123456789abcdef0123',
    defaultMessage: '0123456789abcdef0123',
    description:
      'Example recovery code shown as the placeholder in the recovery code field: 20 hexadecimal characters. Not translatable text; keep as is.',
  },
  backToSignIn: {
    id: 'fresco.SignInForm.backToSignIn',
    defaultMessage: 'Back to sign in',
    description:
      'Text button with a back arrow, in the recovery code form and the two-factor step, that returns to the username and password sign-in form.',
  },
  signIn: {
    id: 'fresco.SignInForm.signIn',
    defaultMessage: 'Sign in',
    description:
      'Text on the submit button of the recovery code sign-in form, which signs in with a username and recovery code.',
  },
  enterOneOfYourRecoveryCodes: {
    id: 'fresco.SignInForm.enterOneOfYourRecoveryCodes',
    defaultMessage: 'Enter one of your recovery codes',
    description:
      'Label of the recovery code field on the two-factor sign-in step, shown when the researcher chose to use a recovery code instead of the authenticator app.',
  },
  enterYour6DigitCodeFromYour: {
    id: 'fresco.SignInForm.enterYour6DigitCodeFromYour',
    defaultMessage: 'Enter your 6-digit code from your authenticator app',
    description:
      "Label of the six-box code field on the two-factor sign-in step, asking for the current code shown by the researcher's authenticator app.",
  },
  verify: {
    id: 'fresco.SignInForm.verify',
    defaultMessage: 'Verify',
    description:
      'Text on the submit button of the two-factor sign-in step; checks the code entered and completes sign-in.',
  },
  password: {
    id: 'fresco.SignInForm.password',
    defaultMessage: 'Password',
    description: 'Label of the password field in the sign-in form.',
  },
  enterYourPassword: {
    id: 'fresco.SignInForm.enterYourPassword',
    defaultMessage: 'Enter your password',
    description:
      'Placeholder inside the password field, and the hint under it, in the sign-in form.',
  },
  or: {
    id: 'fresco.SignInForm.or',
    defaultMessage: 'or',
    description:
      'Short word on a dividing line between the password sign-in form and the passkey sign-in button, meaning the researcher can use either one.',
  },
  troubleSigningIn: {
    id: 'fresco.SignInForm.troubleSigningIn',
    defaultMessage: 'Trouble signing in?',
    description:
      'Link-style button at the bottom of the sign-in form that opens the recovery code sign-in form, for researchers who cannot use their password.',
  },
});

function isRateLimited(
  result: LoginResult,
): result is { success: false; rateLimited: true; retryAfter: number } {
  return 'rateLimited' in result;
}

function isTwoFactorRequired(result: LoginResult): result is {
  success: false;
  requiresTwoFactor: true;
  twoFactorToken: string;
} {
  return 'requiresTwoFactor' in result;
}

function isTwoFactorSetupRequired(result: LoginResult): result is {
  success: true;
  requiresTwoFactorSetup: true;
} {
  return 'requiresTwoFactorSetup' in result;
}

export const SignInForm = () => {
  const intl = useAppIntl();
  const { loginSchema } = createAuthSchemas(createMessageError);

  const router = useRouter();

  const [twoFactorRequired, setTwoFactorRequired] = useState(false);
  const [twoFactorToken, setTwoFactorToken] = useState<string | null>(null);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);
  const [useRecovery, setUseRecovery] = useState(false);

  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const [showRecovery, setShowRecovery] = useState(false);

  // The server has no WebAuthn API, so the capability check can only run once
  // there is a browser to ask. `useHasHydrated` is false through the hydrating
  // render — matching the server's markup — and true afterwards.
  const hasHydrated = useHasHydrated();
  const webauthnSupported = hasHydrated && browserSupportsWebAuthn();

  useEffect(() => {
    if (retryAfter === null || retryAfter <= 0) {
      return undefined;
    }

    const interval = setInterval(() => {
      setRetryAfter((prev) => {
        if (prev === null || prev <= 1) {
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [retryAfter]);

  const handleSubmit: FormSubmitHandler = async (data) => {
    const result = await login(data);

    if (isRateLimited(result)) {
      const secondsRemaining = Math.ceil(
        (result.retryAfter - Date.now()) / 1000,
      );
      setRetryAfter(Math.max(secondsRemaining, 1));
      return {
        success: false,
        formErrors: [
          createMessageError(messages.copyTooManyAttemptsTryAgainInSeconds, {
            value1: Math.max(secondsRemaining, 1),
          }),
        ],
      };
    }

    if (isTwoFactorRequired(result)) {
      setTwoFactorToken(result.twoFactorToken);
      setTwoFactorRequired(true);
      return { success: false };
    }

    if (result.success) {
      // The dashboard would only send a gated account back out to the setup
      // page; going there directly avoids rendering the dashboard shell first.
      router.push(
        isTwoFactorSetupRequired(result) ? TWO_FACTOR_SETUP_PATH : '/dashboard',
      );
    }

    return result;
  };

  const handleTwoFactorSubmit: FormSubmitHandler = async (data) => {
    const code = typeof data.code === 'string' ? data.code : undefined;
    if (!code) {
      return {
        success: false,
        fieldErrors: {
          code: [createMessageError(messages.copyCodeIsRequired)],
        },
      };
    }

    const result = await verifyTwoFactor({ twoFactorToken, code });

    if (!result.success) {
      const error =
        'formErrors' in result && result.formErrors
          ? (result.formErrors[0] ??
            createMessageError(messages.copyVerificationFailed))
          : createMessageError(messages.copyVerificationFailed);
      return { success: false, formErrors: [error] };
    }

    router.push('/dashboard');
    return { success: true };
  };

  const handlePasskeySignIn = async () => {
    setPasskeyError(null);
    setPasskeyLoading(true);

    try {
      const { error, data } = await generateAuthenticationOptions();
      if (error || !data) {
        setPasskeyError(
          error ??
            createMessageError(messages.copyFailedToStartPasskeyAuthentication),
        );
        return;
      }

      // IMMEDIATELY call startAuthentication — preserves Safari user gesture
      const credential = await startAuthentication({
        optionsJSON: data.options,
      });

      const result = await verifyAuthentication({ credential });
      if (result.error) {
        setPasskeyError(result.error);
        return;
      }

      router.push('/dashboard');
    } catch (e) {
      setPasskeyError(
        describePasskeyCeremonyError(
          e,
          'signIn',
          messages.copyPasskeyAuthenticationFailed,
        ),
      );
    } finally {
      setPasskeyLoading(false);
    }
  };

  const handleRecoveryLogin: FormSubmitHandler = async (data) => {
    const username =
      typeof data.username === 'string' ? data.username : undefined;
    const recoveryCode =
      typeof data.recoveryCode === 'string' ? data.recoveryCode : undefined;

    if (!username || !recoveryCode) {
      return {
        success: false,
        formErrors: [
          createMessageError(messages.copyUsernameAndRecoveryCodeAreRequired),
        ],
      };
    }

    const result = await recoveryCodeLogin({ username, recoveryCode });

    if (result.success) {
      router.push('/dashboard');
    }

    return result;
  };

  const handleBackToSignIn = () => {
    setTwoFactorRequired(false);
    setTwoFactorToken(null);
    setUseRecovery(false);
    setShowRecovery(false);
    setPasskeyError(null);
  };

  if (showRecovery) {
    return (
      <Form
        onSubmit={handleRecoveryLogin}
        id="recovery-login"
        className="w-full"
      >
        <Field
          name="username"
          label={intl.formatMessage(messages.username)}
          placeholder={intl.formatMessage(messages.enterYourUsername)}
          component={InputField}
          required={intl.formatMessage(messages.requiredUsername)}
          autoComplete="username"
          prefixComponent={<User2 />}
        />
        <Field
          name="recoveryCode"
          label={intl.formatMessage(messages.recoveryCode)}
          component={InputField}
          required={intl.formatMessage(messages.requiredRecovery)}
          className="font-monospace tracking-widest"
          placeholder={intl.formatMessage(messages.example0123456789abcdef0123)}
          autoComplete="off"
        />
        <div className="tablet-landscape:flex-row tablet-landscape:justify-between mt-4 flex flex-col gap-2">
          <Button
            variant="text"
            type="button"
            onClick={handleBackToSignIn}
            icon={<ArrowLeft className="rtl:rotate-180" />}
          >
            {intl.formatMessage(messages.backToSignIn)}
          </Button>
          <SubmitButton
            form="recovery-login"
            submittingText={intl.formatMessage(messages.verifying)}
          >
            {intl.formatMessage(messages.signIn)}
          </SubmitButton>
        </div>
      </Form>
    );
  }

  if (twoFactorRequired) {
    return (
      <Form
        key={useRecovery ? 'recovery' : 'totp'}
        onSubmit={handleTwoFactorSubmit}
        id="sign-in-2fa"
      >
        {useRecovery ? (
          <Field
            name="code"
            label={intl.formatMessage(messages.enterOneOfYourRecoveryCodes)}
            component={InputField}
            required={intl.formatMessage(messages.requiredRecovery)}
            className="font-monospace tracking-widest"
            placeholder={intl.formatMessage(
              messages.example0123456789abcdef0123,
            )}
            autoComplete="off"
          />
        ) : (
          <Field
            name="code"
            label={intl.formatMessage(messages.enterYour6DigitCodeFromYour)}
            component={SegmentedCodeField}
            required={intl.formatMessage(messages.requiredCode)}
            segments={6}
            characterSet="numeric"
            size="lg"
          />
        )}
        <Button
          type="button"
          onClick={() => setUseRecovery((prev) => !prev)}
          variant="link"
        >
          {useRecovery
            ? intl.formatMessage(messages.copyUseAuthenticatorAppInstead)
            : intl.formatMessage(messages.copyUseARecoveryCodeInstead)}
        </Button>

        <DialogFooter>
          <Button
            variant="text"
            onClick={handleBackToSignIn}
            icon={<ArrowLeft className="rtl:rotate-180" />}
          >
            {intl.formatMessage(messages.backToSignIn)}
          </Button>
          <SubmitButton
            form="sign-in-2fa"
            submittingText={intl.formatMessage(messages.verifying)}
          >
            {intl.formatMessage(messages.verify)}
          </SubmitButton>
        </DialogFooter>
      </Form>
    );
  }

  return (
    <>
      <Form onSubmit={handleSubmit} className="w-full">
        <Field
          key="username"
          name="username"
          label={intl.formatMessage(messages.username)}
          placeholder={intl.formatMessage(messages.enterYourUsername)}
          custom={{
            schema: loginSchema.shape.username,
            hint: intl.formatMessage(messages.enterYourUsername),
          }}
          component={InputField}
          autoComplete="username"
          prefixComponent={<User2 />}
        />
        <Field
          key="password"
          name="password"
          label={intl.formatMessage(messages.password)}
          placeholder={intl.formatMessage(messages.enterYourPassword)}
          component={PasswordField}
          custom={{
            schema: loginSchema.shape.password,
            hint: intl.formatMessage(messages.enterYourPassword),
          }}
          autoComplete="current-password"
          prefixComponent={<LockIcon />}
        />
        <div className="mt-8 flex flex-col">
          <SubmitButton
            key="submit"
            submittingText={intl.formatMessage(messages.signingIn)}
            disabled={retryAfter !== null && retryAfter > 0}
          >
            {retryAfter !== null && retryAfter > 0
              ? intl.formatMessage(messages.copyTryAgainInS, {
                  value1: retryAfter,
                })
              : intl.formatMessage(messages.copySignIn)}
          </SubmitButton>
        </div>
      </Form>

      {webauthnSupported && (
        <>
          <div className="flex items-center gap-3">
            <div className="bg-outline h-px flex-1" />
            <span className="my-2 text-sm">
              {intl.formatMessage(messages.or)}
            </span>
            <div className="bg-outline h-px flex-1" />
          </div>

          <Button
            className="h-auto min-h-12 w-full py-2 text-center text-wrap"
            onClick={handlePasskeySignIn}
            disabled={passkeyLoading}
            icon={<KeyRound />}
          >
            {passkeyLoading
              ? intl.formatMessage(messages.copyWaitingForPasskey)
              : intl.formatMessage(messages.copySignInWithAPasskey)}
          </Button>

          {passkeyError && (
            <Paragraph
              intent="smallText"
              className="text-destructive text-center"
            >
              <AppErrorMessage error={passkeyError} />
            </Paragraph>
          )}
        </>
      )}

      <Button
        variant="link"
        type="button"
        onClick={() => setShowRecovery(true)}
        className="mt-4 text-wrap"
      >
        {intl.formatMessage(messages.troubleSigningIn)}
      </Button>
    </>
  );
};
