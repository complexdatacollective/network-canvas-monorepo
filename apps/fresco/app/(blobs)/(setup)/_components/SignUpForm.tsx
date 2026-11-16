'use client';

import {
  browserSupportsWebAuthn,
  startRegistration,
} from '@simplewebauthn/browser';
import { useRouter } from 'next/navigation';
import { useLayoutEffect, useRef, useState } from 'react';
import { useMediaQuery } from 'usehooks-ts';

import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import { AppErrorMessage, useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import FieldGroup from '@codaco/fresco-ui/form/FieldGroup';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import PasswordField from '@codaco/fresco-ui/form/fields/PasswordField';
import RichSelectGroupField from '@codaco/fresco-ui/form/fields/RichSelectGroup';
import Form from '@codaco/fresco-ui/form/Form';
import {
  type FormSubmissionResult,
  type FormSubmitHandler,
} from '@codaco/fresco-ui/form/store/types';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import useHasHydrated from '@codaco/fresco-ui/hooks/useHasHydrated';
import { signup } from '~/actions/auth';
import {
  generateSignupRegistrationOptions,
  signupWithPasskey,
} from '~/actions/webauthn';
import { useFrescoLocale } from '~/i18n/FrescoI18nProvider';
import { describePasskeyCeremonyError } from '~/i18n/passkeyCeremony';
import { createAuthSchemas } from '~/schemas/auth';

const messages = defineMessages({
  copyUsernameIsRequired: {
    id: 'fresco.SignUpForm.copyUsernameIsRequired',
    defaultMessage: 'Username is required',
    description:
      'Error shown above the first-account form of the setup wizard when the researcher chooses a passkey and submits without a username.',
  },
  copyFailedToStartPasskeyRegistration: {
    id: 'fresco.SignUpForm.copyFailedToStartPasskeyRegistration',
    defaultMessage: 'Failed to start passkey registration',
    description:
      'Error shown above the first-account form of the setup wizard when the server could not prepare the registration of a passkey.',
  },
  copyPasskeyRegistrationFailed: {
    id: 'fresco.SignUpForm.copyPasskeyRegistrationFailed',
    defaultMessage: 'Passkey registration failed',
    description:
      'Fallback error shown above the first-account form of the setup wizard when creating the passkey fails for a reason with no more specific message.',
  },
  username: {
    id: 'fresco.SignUpForm.username',
    defaultMessage: 'Username',
    description:
      'Label of the username field in the form that creates the first researcher account during setup.',
  },
  username2: {
    id: 'fresco.SignUpForm.username2',
    defaultMessage: 'username...',
    description:
      'Placeholder inside the empty username field of the first-account form in the setup wizard.',
  },
  yourUsernameShouldBeAtLeast4: {
    id: 'fresco.SignUpForm.yourUsernameShouldBeAtLeast4',
    defaultMessage:
      'Your username should be at least 4 characters, and must not contain any spaces.',
    description:
      'Hint shown under the username field of the first-account form in the setup wizard, explaining the rules for a valid username.',
  },
  atLeast4CharactersNoSpaces: {
    id: 'fresco.SignUpForm.atLeast4CharactersNoSpaces',
    defaultMessage: 'At least 4 characters, no spaces',
    description:
      'Short validation hint for the username field of the first-account form in the setup wizard, stating the length and no-spaces rules.',
  },
  authenticationMethod: {
    id: 'fresco.SignUpForm.authenticationMethod',
    defaultMessage: 'Authentication method',
    description:
      'Label of the choice between a passkey and a password for the first researcher account, in the setup wizard. Only shown when the browser supports passkeys.',
  },
  passkey: {
    id: 'fresco.SignUpForm.passkey',
    defaultMessage: 'Passkey',
    description:
      'Title of the passkey option in the authentication method choice of the first-account form in the setup wizard. A passkey is a sign-in credential stored on the device.',
  },
  passkeyDescription: {
    id: 'fresco.SignUpForm.useBiometricsOrYourDeviceSecurityTo',
    defaultMessage:
      'Use biometrics or your device security to sign in. No password to remember — the most secure option.',
    description:
      'Description under the passkey option in the authentication method choice of the first-account form in the setup wizard.',
  },
  password: {
    id: 'fresco.SignUpForm.password',
    defaultMessage: 'Password',
    description:
      'Label of the password field, and title of the password option in the authentication method choice, in the first-account form of the setup wizard.',
  },
  traditionalUsernameAndPasswordRequiresAStrong: {
    id: 'fresco.SignUpForm.traditionalUsernameAndPasswordRequiresAStrong',
    defaultMessage:
      'Traditional username and password. Requires a strong password.',
    description:
      'Description under the password option in the authentication method choice of the first-account form in the setup wizard.',
  },
  atLeast8CharactersWithLowercaseUppercase: {
    id: 'fresco.SignUpForm.atLeast8CharactersWithLowercaseUppercase',
    defaultMessage:
      'At least 8 characters with lowercase, uppercase, number and symbol',
    description:
      'Hint under the password field of the first-account form in the setup wizard, stating the rules for a valid password.',
  },
  confirmPassword: {
    id: 'fresco.SignUpForm.confirmPassword',
    defaultMessage: 'Confirm password',
    description:
      'Label of the field where the password is typed a second time, in the first-account form of the setup wizard.',
  },
  createAccount: {
    id: 'fresco.SignUpForm.createAccount',
    defaultMessage: 'Create account',
    description:
      'Text on the submit button of the first-account form in the setup wizard; creates the first researcher account.',
  },
});

type SignUpFormProps = {
  sandboxMode?: boolean;
};

export const SignUpForm = ({ sandboxMode = false }: SignUpFormProps) => {
  const intl = useAppIntl();
  const { preference } = useFrescoLocale();
  const latestPreference = useRef(preference);
  useLayoutEffect(() => {
    latestPreference.current = preference;
  }, [preference]);
  const { createUserSchema } = createAuthSchemas(createMessageError);

  const router = useRouter();
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);

  // The server has no WebAuthn API, so the capability check can only run once
  // there is a browser to ask. `useHasHydrated` is false through the hydrating
  // render — matching the server's markup — and true afterwards.
  const hasHydrated = useHasHydrated();
  const webauthnSupported = hasHydrated && browserSupportsWebAuthn();

  const showAuthMethodChoice = webauthnSupported && !sandboxMode;

  const handleSubmit: FormSubmitHandler = async (data) => {
    const values = data as Record<string, unknown>;
    const authMethod =
      typeof values?.authMethod === 'string' ? values.authMethod : 'password';
    const username =
      typeof values?.username === 'string' ? values.username : '';

    if (authMethod === 'passkey') {
      return handlePasskeySignup(username);
    }

    return handlePasswordSignup(data);
  };

  const handlePasswordSignup: FormSubmitHandler = async (data) => {
    const result = await signup(data, latestPreference.current);

    return {
      success: false,
      formErrors: result.error ? [result.error] : [],
    };
  };

  const handlePasskeySignup = async (
    username: string,
  ): Promise<FormSubmissionResult> => {
    if (!username) {
      return {
        success: false,
        formErrors: [createMessageError(messages.copyUsernameIsRequired)],
      };
    }

    setPasskeyError(null);
    setPasskeyLoading(true);

    try {
      // Step 1: Generate registration options (no session created yet)
      const { error: genError, data: regData } =
        await generateSignupRegistrationOptions(username);
      if (genError || !regData) {
        setPasskeyLoading(false);
        return {
          success: false,
          formErrors: [
            genError ??
              createMessageError(messages.copyFailedToStartPasskeyRegistration),
          ],
        };
      }

      // Step 2: OS passkey popup (still no session)
      const credential = await startRegistration({
        optionsJSON: regData.options,
      });

      // Step 3: Atomic signup — creates user + stores passkey + session
      const result = await signupWithPasskey({
        username,
        credential,
        locale: latestPreference.current,
      });

      if (result.error) {
        setPasskeyLoading(false);
        return {
          success: false,
          formErrors: [result.error],
        };
      }

      // Session now exists — navigate to next step
      router.refresh();
      router.push('/setup?step=2');
      return { success: true };
    } catch (e) {
      setPasskeyLoading(false);
      return {
        success: false,
        formErrors: [
          describePasskeyCeremonyError(
            e,
            'registration',
            messages.copyPasskeyRegistrationFailed,
          ),
        ],
      };
    }
  };

  const isSmallScreen = useMediaQuery('(max-width: 640px)');

  return (
    <Form onSubmit={handleSubmit} className="flex flex-col">
      <Field
        name="username"
        label={intl.formatMessage(messages.username)}
        placeholder={intl.formatMessage(messages.username2)}
        hint={intl.formatMessage(messages.yourUsernameShouldBeAtLeast4)}
        custom={{
          schema: createUserSchema.shape.username,
          hint: intl.formatMessage(messages.atLeast4CharactersNoSpaces),
        }}
        component={InputField}
        autoComplete="do-not-autofill"
      />
      {showAuthMethodChoice && (
        <Field
          name="authMethod"
          label={intl.formatMessage(messages.authenticationMethod)}
          component={RichSelectGroupField}
          orientation={isSmallScreen ? 'vertical' : 'horizontal'}
          initialValue="passkey"
          options={[
            {
              label: intl.formatMessage(messages.passkey),
              value: 'passkey',
              description: intl.formatMessage(messages.passkeyDescription),
            },
            {
              label: intl.formatMessage(messages.password),
              value: 'password',
              description: intl.formatMessage(
                messages.traditionalUsernameAndPasswordRequiresAStrong,
              ),
            },
          ]}
        />
      )}
      <FieldGroup
        watch={['authMethod']}
        condition={(values) => values.authMethod !== 'passkey'}
      >
        <Field
          name="password"
          label={intl.formatMessage(messages.password)}
          placeholder={passwordPlaceholder}
          custom={{
            schema: createUserSchema.shape.password,
            hint: intl.formatMessage(
              messages.atLeast8CharactersWithLowercaseUppercase,
            ),
          }}
          component={PasswordField}
          showStrengthMeter
          autoComplete="do-not-autofill"
          showValidationHints
        />
        <FieldGroup
          watch={['password']}
          condition={(values) => !!values.password}
        >
          <Field
            name="confirmPassword"
            label={intl.formatMessage(messages.confirmPassword)}
            placeholder={passwordPlaceholder}
            sameAs="password"
            component={PasswordField}
            autoComplete="do-not-autofill"
          />
        </FieldGroup>
      </FieldGroup>
      {passkeyError && (
        <p className="text-destructive text-sm">
          <AppErrorMessage error={passkeyError} />
        </p>
      )}
      <SubmitButton className="mt-6" disabled={passkeyLoading}>
        {intl.formatMessage(messages.createAccount)}
      </SubmitButton>
    </Form>
  );
};

// Stable brand/data display; not translated application copy.
const passwordPlaceholder = '******************';
