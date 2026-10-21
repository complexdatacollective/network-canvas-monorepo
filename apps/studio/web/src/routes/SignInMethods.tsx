import { type ReactNode, useEffect, useRef, useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert } from '@codaco/fresco-ui/Alert';
import Button from '@codaco/fresco-ui/Button';
import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Form from '@codaco/fresco-ui/form/Form';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import Spinner from '@codaco/fresco-ui/Spinner';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { SocialProvider } from '@codaco/studio-contract/schema/status';

import { authClient } from '../lib/auth.ts';
import { studioEmailPattern } from '../lib/emailValidation.ts';
import { GoogleIcon, MicrosoftIcon } from './ProviderIcons.tsx';

const messages = defineMessages({
  linkInvalid: {
    id: 'studio.signIn.linkInvalid',
    defaultMessage:
      'That sign-in link is no longer valid. Enter your email address to request a new one.',
    description:
      'Shown when a magic sign-in link the researcher followed has expired or was already used.',
  },
  didNotComplete: {
    id: 'studio.signIn.didNotComplete',
    defaultMessage: 'Sign-in did not complete. Try again.',
    description:
      'Shown when a sign-in attempt failed for an unspecified reason.',
  },
  magicLinkSendFailed: {
    id: 'studio.signIn.magicLinkSendFailed',
    defaultMessage:
      'The sign-in email could not be sent. Wait a moment and try again.',
    description: 'Form error when requesting a magic sign-in link failed.',
  },
  emailLabel: {
    id: 'studio.signIn.emailLabel',
    defaultMessage: 'Email address',
    description: "Label of the sign-in form's email field.",
  },
  emailHint: {
    id: 'studio.signIn.emailHint',
    defaultMessage: 'The address you use for Studio.',
    description:
      "Hint under the sign-in form's email field when the value is not a valid address.",
  },
  orDivider: {
    id: 'studio.signIn.orDivider',
    defaultMessage: 'or',
    description:
      'Visual divider between the email sign-in form and the social sign-in buttons.',
  },
  socialFailed: {
    id: 'studio.signIn.socialFailed',
    defaultMessage:
      'Sign-in could not be started. Wait a moment and try again.',
    description: 'Shown when handing off to a social sign-in provider failed.',
  },
  continueWithGoogle: {
    id: 'studio.signIn.continueWithGoogle',
    defaultMessage: 'Continue with Google',
    description: 'Button starting sign-in through Google.',
  },
  continueWithMicrosoft: {
    id: 'studio.signIn.continueWithMicrosoft',
    defaultMessage: 'Continue with Microsoft',
    description: 'Button starting sign-in through Microsoft.',
  },
  useDifferentEmail: {
    id: 'studio.signIn.useDifferentEmail',
    defaultMessage: 'Use a different email address',
    description:
      'Button returning from the sent-link confirmation to the email form.',
  },
});

export const signInMethodMessages = messages;

export type MethodWording = {
  linkInvalid: MessageDescriptor;
  didNotComplete: MessageDescriptor;
  magicLinkSendFailed: MessageDescriptor;
  socialFailed: MessageDescriptor;
  emailHint: MessageDescriptor;
};

const SIGN_IN_WORDING: MethodWording = {
  linkInvalid: messages.linkInvalid,
  didNotComplete: messages.didNotComplete,
  magicLinkSendFailed: messages.magicLinkSendFailed,
  socialFailed: messages.socialFailed,
  emailHint: messages.emailHint,
};

const PROVIDERS: Record<
  SocialProvider,
  { label: MessageDescriptor; icon: ReactNode }
> = {
  google: { label: messages.continueWithGoogle, icon: <GoogleIcon /> },
  microsoft: {
    label: messages.continueWithMicrosoft,
    icon: <MicrosoftIcon />,
  },
};

const MAGIC_LINK_ERRORS = new Set(['EXPIRED_TOKEN', 'INVALID_TOKEN']);

/** The `?error=` better-auth appends when a magic link or a provider fails. */
export function CallbackErrorAlert({
  error,
  wording = SIGN_IN_WORDING,
}: {
  error: string;
  wording?: MethodWording;
}) {
  const intl = useAppIntl();
  return (
    <Alert variant="destructive">
      {intl.formatMessage(
        MAGIC_LINK_ERRORS.has(error)
          ? wording.linkInvalid
          : wording.didNotComplete,
      )}
    </Alert>
  );
}

export function EmailField({
  hint = messages.emailHint,
}: {
  hint?: MessageDescriptor;
}) {
  const intl = useAppIntl();
  return (
    <Field
      name="email"
      label={intl.formatMessage(messages.emailLabel)}
      component={InputField}
      type="email"
      required
      pattern={studioEmailPattern(intl, intl.formatMessage(hint))}
      autoComplete="email"
    />
  );
}

export function MagicLinkForm({
  intro,
  submitLabel,
  callbackURL,
  errorCallbackURL,
  onSent,
  wording = SIGN_IN_WORDING,
}: {
  intro: MessageDescriptor;
  submitLabel: MessageDescriptor;
  callbackURL: string;
  errorCallbackURL: string;
  onSent: (email: string) => void;
  wording?: MethodWording;
}) {
  const intl = useAppIntl();
  return (
    <>
      <Paragraph>{intl.formatMessage(intro)}</Paragraph>
      <Form
        onSubmit={async (values) => {
          const email = typeof values.email === 'string' ? values.email : '';
          const failed = {
            success: false,
            formErrors: [intl.formatMessage(wording.magicLinkSendFailed)],
          };
          let result;
          try {
            result = await authClient.signIn.magicLink({
              email,
              callbackURL,
              errorCallbackURL,
            });
          } catch {
            // Unhandled, a rejection would leave the form stuck submitting.
            return failed;
          }
          if (result.error) return failed;
          onSent(email);
          return { success: true };
        }}
      >
        <EmailField hint={wording.emailHint} />
        <SubmitButton>{intl.formatMessage(submitLabel)}</SubmitButton>
      </Form>
    </>
  );
}

export function SocialSignIn({
  providers,
  callbackURL,
  errorCallbackURL,
  divided,
  wording = SIGN_IN_WORDING,
}: {
  providers: readonly SocialProvider[];
  callbackURL: string;
  errorCallbackURL: string;
  divided: boolean;
  wording?: MethodWording;
}) {
  const intl = useAppIntl();
  const [pending, setPending] = useState<SocialProvider | null>(null);
  const [failed, setFailed] = useState(false);

  if (providers.length === 0) return null;

  const signInWith = async (provider: SocialProvider) => {
    setFailed(false);
    setPending(provider);
    try {
      const result = await authClient.signIn.social({
        provider,
        callbackURL,
        // better-auth appends its own ?error=<code> on failure.
        errorCallbackURL,
      });
      if (result.error) {
        setPending(null);
        setFailed(true);
      }
      // On success the browser is navigating to the provider; the button stays
      // busy until the page unloads.
    } catch {
      // A rejection rather than an `error` result — the connection dropping
      // as the redirect starts. Unhandled, it would escape the click handler
      // and leave every provider button disabled until a reload.
      setPending(null);
      setFailed(true);
    }
  };

  return (
    <>
      {divided && (
        <div
          aria-hidden="true"
          className="my-4 flex items-center gap-3 before:h-px before:flex-1 before:bg-current/20 after:h-px after:flex-1 after:bg-current/20"
        >
          {intl.formatMessage(messages.orDivider)}
        </div>
      )}
      {failed && (
        <Alert variant="destructive">
          {intl.formatMessage(wording.socialFailed)}
        </Alert>
      )}
      <div className="flex flex-col items-stretch gap-4">
        {providers.map((provider) => (
          <Button
            key={provider}
            variant="outline"
            disabled={pending !== null}
            aria-busy={pending === provider}
            icon={
              pending === provider ? (
                <Spinner size="xs" />
              ) : (
                PROVIDERS[provider].icon
              )
            }
            onClick={() => void signInWith(provider)}
          >
            {intl.formatMessage(PROVIDERS[provider].label)}
          </Button>
        ))}
      </div>
    </>
  );
}

/**
 * Rendered whether or not a link has been sent, so the live region exists
 * before the confirmation is written into it.
 */
export function SentLinkConfirmation({
  sentTo,
  message,
  onReset,
}: {
  sentTo: string | null;
  message: MessageDescriptor;
  onReset: () => void;
}) {
  const intl = useAppIntl();
  const sentRef = useRef<HTMLParagraphElement>(null);

  // The form (and its focused submit button) unmounts on success; move
  // focus to the confirmation so keyboard users aren't dropped on body.
  useEffect(() => {
    if (sentTo !== null) sentRef.current?.focus();
  }, [sentTo]);

  return (
    <>
      <Paragraph role="status" ref={sentRef} tabIndex={-1}>
        {sentTo !== null && intl.formatMessage(message, { email: sentTo })}
      </Paragraph>
      {sentTo !== null && (
        <Button size="sm" onClick={onReset}>
          {intl.formatMessage(messages.useDifferentEmail)}
        </Button>
      )}
    </>
  );
}
