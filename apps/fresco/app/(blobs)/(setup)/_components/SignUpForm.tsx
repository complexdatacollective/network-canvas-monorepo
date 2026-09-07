'use client';

import {
  browserSupportsWebAuthn,
  startRegistration,
} from '@simplewebauthn/browser';
import { useRouter } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
import { signup } from '~/actions/auth';
import {
  generateSignupRegistrationOptions,
  signupWithPasskey,
} from '~/actions/webauthn';
import { useFrescoLocale } from '~/i18n/FrescoI18nProvider';
import { createAuthSchemas } from '~/schemas/auth';

const messages = defineMessages({
  copyUsernameIsRequired: {
    id: 'fresco.SignUpForm.copyUsernameIsRequired',
    defaultMessage: 'Username is required',
    description: 'Researcher-facing SignUpForm: Username is required',
  },
  copyFailedToStartPasskeyRegistration: {
    id: 'fresco.SignUpForm.copyFailedToStartPasskeyRegistration',
    defaultMessage: 'Failed to start passkey registration',
    description:
      'Researcher-facing SignUpForm: Failed to start passkey registration',
  },
  copyPasskeyRegistrationFailed: {
    id: 'fresco.SignUpForm.copyPasskeyRegistrationFailed',
    defaultMessage: 'Passkey registration failed',
    description: 'Researcher-facing SignUpForm: Passkey registration failed',
  },
  username: {
    id: 'fresco.SignUpForm.username',
    defaultMessage: 'Username',
    description: 'Researcher-facing SignUpForm: Username',
  },
  username2: {
    id: 'fresco.SignUpForm.username2',
    defaultMessage: 'username...',
    description: 'Researcher-facing SignUpForm: username...',
  },
  yourUsernameShouldBeAtLeast4: {
    id: 'fresco.SignUpForm.yourUsernameShouldBeAtLeast4',
    defaultMessage:
      'Your username should be at least 4 characters, and must not contain any spaces.',
    description:
      'Researcher-facing SignUpForm: Your username should be at least 4 characters, and must not contain any spaces.',
  },
  atLeast4CharactersNoSpaces: {
    id: 'fresco.SignUpForm.atLeast4CharactersNoSpaces',
    defaultMessage: 'At least 4 characters, no spaces',
    description:
      'Researcher-facing SignUpForm: At least 4 characters, no spaces',
  },
  authenticationMethod: {
    id: 'fresco.SignUpForm.authenticationMethod',
    defaultMessage: 'Authentication method',
    description: 'Researcher-facing SignUpForm: Authentication method',
  },
  passkey: {
    id: 'fresco.SignUpForm.passkey',
    defaultMessage: 'Passkey',
    description: 'Researcher-facing SignUpForm: Passkey',
  },
  useBiometricsOrYourDeviceSecurityTo: {
    id: 'fresco.SignUpForm.useBiometricsOrYourDeviceSecurityTo',
    defaultMessage:
      'Use biometrics or your device security to sign in. No password to remember — the most secure option.',
    description:
      'Researcher-facing SignUpForm: Use biometrics or your device security to sign in. No password to remember — the most secure option.',
  },
  password: {
    id: 'fresco.SignUpForm.password',
    defaultMessage: 'Password',
    description: 'Researcher-facing SignUpForm: Password',
  },
  traditionalUsernameAndPasswordRequiresAStrong: {
    id: 'fresco.SignUpForm.traditionalUsernameAndPasswordRequiresAStrong',
    defaultMessage:
      'Traditional username and password. Requires a strong password.',
    description:
      'Researcher-facing SignUpForm: Traditional username and password. Requires a strong password.',
  },
  atLeast8CharactersWithLowercaseUppercase: {
    id: 'fresco.SignUpForm.atLeast8CharactersWithLowercaseUppercase',
    defaultMessage:
      'At least 8 characters with lowercase, uppercase, number and symbol',
    description:
      'Researcher-facing SignUpForm: At least 8 characters with lowercase, uppercase, number and symbol',
  },
  confirmPassword: {
    id: 'fresco.SignUpForm.confirmPassword',
    defaultMessage: 'Confirm password',
    description: 'Researcher-facing SignUpForm: Confirm password',
  },
  createAccount: {
    id: 'fresco.SignUpForm.createAccount',
    defaultMessage: 'Create account',
    description: 'Researcher-facing SignUpForm: Create account',
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
  const [webauthnSupported, setWebauthnSupported] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);

  useEffect(() => {
    setWebauthnSupported(browserSupportsWebAuthn());
  }, []);

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
      if (e instanceof Error && e.name === 'NotAllowedError') {
        setPasskeyLoading(false);
        return { success: false };
      }
      setPasskeyLoading(false);
      return {
        success: false,
        formErrors: [
          createMessageError(messages.copyPasskeyRegistrationFailed),
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
              description: intl.formatMessage(
                messages.useBiometricsOrYourDeviceSecurityTo,
              ),
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
