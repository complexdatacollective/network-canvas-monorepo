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
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { login, recoveryCodeLogin, type LoginResult } from '~/actions/auth';
import { verifyTwoFactor } from '~/actions/twoFactor';
import {
  generateAuthenticationOptions,
  verifyAuthentication,
} from '~/actions/webauthn';
import { createAuthSchemas } from '~/schemas/auth';

const messages = defineMessages({
  signingIn: {
    id: 'fresco.SignInForm.signingIn',
    defaultMessage: 'Signing in...',
    description: 'Researcher-facing SignInForm: Signing in...',
  },

  verifying: {
    id: 'fresco.SignInForm.verifying',
    defaultMessage: 'Verifying...',
    description: 'Researcher-facing SignInForm: Verifying...',
  },

  requiredCode: {
    id: 'fresco.SignInForm.requiredCode',
    defaultMessage: 'Code is required',
    description: 'Researcher-facing SignInForm: Code is required',
  },

  requiredRecovery: {
    id: 'fresco.SignInForm.requiredRecovery',
    defaultMessage: 'Recovery code is required',
    description: 'Researcher-facing SignInForm: Recovery code is required',
  },

  requiredUsername: {
    id: 'fresco.SignInForm.requiredUsername',
    defaultMessage: 'Username is required',
    description: 'Researcher-facing SignInForm: Username is required',
  },

  copyTooManyAttemptsTryAgainInSeconds: {
    id: 'fresco.SignInForm.copyTooManyAttemptsTryAgainInSeconds',
    defaultMessage:
      'Too many attempts. Try again in {value1, plural, one {# second} other {# seconds}}.',
    description:
      'Researcher-facing SignInForm: Too many attempts. Try again in value seconds.',
  },
  copyCodeIsRequired: {
    id: 'fresco.SignInForm.copyCodeIsRequired',
    defaultMessage: 'Code is required',
    description: 'Researcher-facing SignInForm: Code is required',
  },
  copyVerificationFailed: {
    id: 'fresco.SignInForm.copyVerificationFailed',
    defaultMessage: 'Verification failed',
    description: 'Researcher-facing SignInForm: Verification failed',
  },
  copyFailedToStartPasskeyAuthentication: {
    id: 'fresco.SignInForm.copyFailedToStartPasskeyAuthentication',
    defaultMessage: 'Failed to start passkey authentication',
    description:
      'Researcher-facing SignInForm: Failed to start passkey authentication',
  },
  copyPasskeyAuthenticationFailed: {
    id: 'fresco.SignInForm.copyPasskeyAuthenticationFailed',
    defaultMessage: 'Passkey authentication failed',
    description: 'Researcher-facing SignInForm: Passkey authentication failed',
  },
  copyUsernameAndRecoveryCodeAreRequired: {
    id: 'fresco.SignInForm.copyUsernameAndRecoveryCodeAreRequired',
    defaultMessage: 'Username and recovery code are required',
    description:
      'Researcher-facing SignInForm: Username and recovery code are required',
  },
  copyUseAuthenticatorAppInstead: {
    id: 'fresco.SignInForm.copyUseAuthenticatorAppInstead',
    defaultMessage: 'Use authenticator app instead',
    description: 'Researcher-facing SignInForm: Use authenticator app instead',
  },
  copyUseARecoveryCodeInstead: {
    id: 'fresco.SignInForm.copyUseARecoveryCodeInstead',
    defaultMessage: 'Use a recovery code instead',
    description: 'Researcher-facing SignInForm: Use a recovery code instead',
  },
  copyTryAgainInS: {
    id: 'fresco.SignInForm.copyTryAgainInS',
    defaultMessage:
      'Try again in {value1, plural, one {# second} other {# seconds}}',
    description: 'Researcher-facing SignInForm: Try again in values',
  },
  copySignIn: {
    id: 'fresco.SignInForm.copySignIn',
    defaultMessage: 'Sign in',
    description: 'Researcher-facing SignInForm: Sign in',
  },
  copyWaitingForPasskey: {
    id: 'fresco.SignInForm.copyWaitingForPasskey',
    defaultMessage: 'Waiting for passkey...',
    description: 'Researcher-facing SignInForm: Waiting for passkey...',
  },
  copySignInWithAPasskey: {
    id: 'fresco.SignInForm.copySignInWithAPasskey',
    defaultMessage: 'Sign in with a passkey',
    description: 'Researcher-facing SignInForm: Sign in with a passkey',
  },
  username: {
    id: 'fresco.SignInForm.username',
    defaultMessage: 'Username',
    description: 'Researcher-facing SignInForm: Username',
  },
  enterYourUsername: {
    id: 'fresco.SignInForm.enterYourUsername',
    defaultMessage: 'Enter your username',
    description: 'Researcher-facing SignInForm: Enter your username',
  },
  recoveryCode: {
    id: 'fresco.SignInForm.recoveryCode',
    defaultMessage: 'Recovery code',
    description: 'Researcher-facing SignInForm: Recovery code',
  },
  example0123456789abcdef0123: {
    id: 'fresco.SignInForm.0123456789abcdef0123',
    defaultMessage: '0123456789abcdef0123',
    description: 'Researcher-facing SignInForm: 0123456789abcdef0123',
  },
  backToSignIn: {
    id: 'fresco.SignInForm.backToSignIn',
    defaultMessage: 'Back to sign in',
    description: 'Researcher-facing SignInForm: Back to sign in',
  },
  signIn: {
    id: 'fresco.SignInForm.signIn',
    defaultMessage: 'Sign in',
    description: 'Researcher-facing SignInForm: Sign in',
  },
  enterOneOfYourRecoveryCodes: {
    id: 'fresco.SignInForm.enterOneOfYourRecoveryCodes',
    defaultMessage: 'Enter one of your recovery codes',
    description:
      'Researcher-facing SignInForm: Enter one of your recovery codes',
  },
  enterYour6DigitCodeFromYour: {
    id: 'fresco.SignInForm.enterYour6DigitCodeFromYour',
    defaultMessage: 'Enter your 6-digit code from your authenticator app',
    description:
      'Researcher-facing SignInForm: Enter your 6-digit code from your authenticator app',
  },
  verify: {
    id: 'fresco.SignInForm.verify',
    defaultMessage: 'Verify',
    description: 'Researcher-facing SignInForm: Verify',
  },
  password: {
    id: 'fresco.SignInForm.password',
    defaultMessage: 'Password',
    description: 'Researcher-facing SignInForm: Password',
  },
  enterYourPassword: {
    id: 'fresco.SignInForm.enterYourPassword',
    defaultMessage: 'Enter your password',
    description: 'Researcher-facing SignInForm: Enter your password',
  },
  or: {
    id: 'fresco.SignInForm.or',
    defaultMessage: 'or',
    description: 'Researcher-facing SignInForm: or',
  },
  troubleSigningIn: {
    id: 'fresco.SignInForm.troubleSigningIn',
    defaultMessage: 'Trouble signing in?',
    description: 'Researcher-facing SignInForm: Trouble signing in?',
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

export const SignInForm = () => {
  const intl = useAppIntl();
  const { loginSchema } = createAuthSchemas(createMessageError);

  const router = useRouter();

  const [twoFactorRequired, setTwoFactorRequired] = useState(false);
  const [twoFactorToken, setTwoFactorToken] = useState<string | null>(null);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);
  const [useRecovery, setUseRecovery] = useState(false);

  const [webauthnSupported, setWebauthnSupported] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const [showRecovery, setShowRecovery] = useState(false);

  useEffect(() => {
    setWebauthnSupported(browserSupportsWebAuthn());
  }, []);

  useEffect(() => {
    if (retryAfter === null || retryAfter <= 0) {
      return;
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
      router.push('/dashboard');
    }

    return result;
  };

  const handleTwoFactorSubmit: FormSubmitHandler = async (data) => {
    const values = data as Record<string, string>;
    const code = values.code;
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
      if (e instanceof Error && e.name === 'NotAllowedError') {
        return;
      }
      setPasskeyError(
        createMessageError(messages.copyPasskeyAuthenticationFailed),
      );
    } finally {
      setPasskeyLoading(false);
    }
  };

  const handleRecoveryLogin: FormSubmitHandler = async (data) => {
    const values = data as Record<string, string>;
    const username = values.username;
    const recoveryCode = values.recoveryCode;

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
            icon={<ArrowLeft />}
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
            icon={<ArrowLeft />}
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
            variant="outline"
            className="w-full"
            onClick={handlePasskeySignIn}
            disabled={passkeyLoading}
            icon={<KeyRound />}
          >
            {passkeyLoading
              ? intl.formatMessage(messages.copyWaitingForPasskey)
              : intl.formatMessage(messages.copySignInWithAPasskey)}
          </Button>

          {passkeyError && (
            <Paragraph className="text-destructive text-center text-sm">
              <AppErrorMessage error={passkeyError} />
            </Paragraph>
          )}
        </>
      )}

      <Button
        variant="link"
        type="button"
        onClick={() => setShowRecovery(true)}
        className="mt-4"
      >
        {intl.formatMessage(messages.troubleSigningIn)}
      </Button>
    </>
  );
};
