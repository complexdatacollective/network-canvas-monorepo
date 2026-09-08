import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getRouteApi, useRouter } from '@tanstack/react-router';
import { type ReactNode, useEffect, useRef, useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert } from '@codaco/fresco-ui/Alert';
import Button from '@codaco/fresco-ui/Button';
import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import PasswordField from '@codaco/fresco-ui/form/fields/PasswordField';
import Form from '@codaco/fresco-ui/form/Form';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { routeFocusTargetProps } from '@codaco/fresco-ui/navigation/RouteFocus';
import Spinner from '@codaco/fresco-ui/Spinner';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { SocialProvider } from '@codaco/studio-rpc';

import { orpc } from '../lib/api.ts';
import { authClient } from '../lib/auth.ts';
import { studioEmailPattern } from '../lib/emailValidation.ts';
import { sessionQueryOptions } from '../lib/session.ts';
import { GoogleIcon, MicrosoftIcon } from './ProviderIcons.tsx';

const route = getRouteApi('/focused/sign-in');

const messages = defineMessages({
  heading: {
    id: 'studio.signIn.heading',
    defaultMessage: 'Sign in',
    description: 'Heading of the sign-in screen.',
  },
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
  unavailable: {
    id: 'studio.signIn.unavailable',
    defaultMessage:
      'Sign-in is not available on this server. Contact the person who runs it.',
    description:
      'Shown on a self-hosted instance whose administrator has configured no sign-in method.',
  },
  magicLinkIntro: {
    id: 'studio.signIn.magicLinkIntro',
    defaultMessage:
      'Enter your email address and we will send you a sign-in link.',
    description: 'Introduction above the magic-link sign-in form.',
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
  sendLink: {
    id: 'studio.signIn.sendLink',
    defaultMessage: 'Send sign-in link',
    description: 'Submit button of the magic-link sign-in form.',
  },
  passwordIntro: {
    id: 'studio.signIn.passwordIntro',
    defaultMessage: 'Enter your email address and password.',
    description: 'Introduction above the password sign-in form.',
  },
  wrongCredentials: {
    id: 'studio.signIn.wrongCredentials',
    defaultMessage: 'That email or password is not correct.',
    description: 'Form error when the email and password did not match.',
  },
  passwordLabel: {
    id: 'studio.signIn.passwordLabel',
    defaultMessage: 'Password',
    description: "Label of the sign-in form's password field.",
  },
  submit: {
    id: 'studio.signIn.submit',
    defaultMessage: 'Sign in',
    description: 'Submit button of the password sign-in form.',
  },
  useMagicLink: {
    id: 'studio.signIn.useMagicLink',
    defaultMessage: 'Sign in with a magic link instead',
    description: 'Toggle from the password form to the magic-link form.',
  },
  usePassword: {
    id: 'studio.signIn.usePassword',
    defaultMessage: 'Sign in with a password instead',
    description: 'Toggle from the magic-link form to the password form.',
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
  sentTo: {
    id: 'studio.signIn.sentTo',
    defaultMessage:
      'We sent a sign-in link to {email}. Open it on this device to continue. The link expires in 5 minutes.',
    description:
      'Confirmation after a magic sign-in link was sent; {email} is the address it went to.',
  },
  useDifferentEmail: {
    id: 'studio.signIn.useDifferentEmail',
    defaultMessage: 'Use a different email address',
    description:
      'Button returning from the sent-link confirmation to the email form.',
  },
});

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

export default function SignIn() {
  const intl = useAppIntl();
  const { error, invitationId } = route.useSearch();
  const status = useQuery(orpc.status.queryOptions());
  const queryClient = useQueryClient();
  const router = useRouter();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [mode, setMode] = useState<'magic-link' | 'password'>('magic-link');
  const [socialPending, setSocialPending] = useState<SocialProvider | null>(
    null,
  );
  const [socialFailed, setSocialFailed] = useState(false);
  const sentRef = useRef<HTMLParagraphElement>(null);

  // The form (and its focused submit button) unmounts on success; move
  // focus to the confirmation so keyboard users aren't dropped on body.
  useEffect(() => {
    if (sentTo !== null) sentRef.current?.focus();
  }, [sentTo]);

  // Only definitive status data closes anything off; not knowing (the status
  // query failing) must not lock the door.
  const auth = status.isSuccess ? status.data.auth : undefined;
  const emailAndPassword = auth ? auth.emailAndPassword : false;
  const unavailable = auth
    ? !auth.enabled ||
      (!auth.magicLink &&
        !auth.emailAndPassword &&
        auth.socialProviders.length === 0)
    : false;

  const magicLink = auth ? auth.magicLink : true;
  const socialProviders = auth?.socialProviders ?? [];
  // A researcher toggles between the two only when both are actually
  // offered; otherwise whichever one is configured is simply what renders.
  // If magic-link is off, password is the only email-based method left, so
  // it shows regardless of `mode` — there is nothing to toggle away from.
  const canTogglePasswordMode = magicLink && emailAndPassword;
  const showPasswordForm =
    emailAndPassword && (mode === 'password' || !magicLink);
  const showMagicLinkForm = magicLink && !showPasswordForm;
  // Where both routes into a session come back to. Each is a full document
  // load — the magic link's verify redirect and the provider's callback — so
  // the URL has to be one that reads the session that has just been
  // established and sends the researcher on (§6.4).
  //
  // `/` is not that URL. On a managed deployment it renders marketing whether
  // or not anyone is signed in (§10.4), so a researcher who has just signed in
  // would land back on the public page and have to press "Sign in" again. This
  // page is where the resolution already lives: its own guard bounces an
  // already-signed-in visitor to their landing destination, and leaves them
  // here to try again in the one case it cannot resolve — which is the right
  // answer for an arrival that did not produce a session either.
  //
  // An invitation is the exception, because it names a destination of its own.
  const callbackURL = invitationId
    ? `/invitations/${encodeURIComponent(invitationId)}`
    : '/sign-in';
  const errorCallbackURL = invitationId
    ? `/sign-in?invitationId=${encodeURIComponent(invitationId)}`
    : '/sign-in';

  const signInWith = async (provider: SocialProvider) => {
    setSocialFailed(false);
    setSocialPending(provider);
    try {
      const result = await authClient.signIn.social({
        provider,
        callbackURL,
        // better-auth appends its own ?error=<code> on failure.
        errorCallbackURL,
      });
      if (result.error) {
        setSocialPending(null);
        setSocialFailed(true);
      }
      // On success the browser is navigating to the provider; the button stays
      // busy until the page unloads.
    } catch {
      // A rejection rather than an `error` result — the connection dropping
      // as the redirect starts. Unhandled, it would escape the click handler
      // and leave every provider button disabled until a reload.
      setSocialPending(null);
      setSocialFailed(true);
    }
  };

  return (
    // Every route in §5.2 renders exactly one `<main id="main-content">`
    // (§11.2). A focused screen has no area layout to own that landmark, so
    // it owns its own.
    <main
      id="main-content"
      className="flex h-full items-center justify-center p-4"
    >
      <Surface maxWidth="xl" spacing="lg">
        {/*
          The landing point §7.2 requires of every route, and this one earns it
          twice over: signing out is an SPA navigation to here, and it unmounts
          the account menu the researcher activated, so focus falls to `<body>`
          and there is nothing else to catch it.
        */}
        <Heading level="h1" {...routeFocusTargetProps}>
          {intl.formatMessage(messages.heading)}
        </Heading>
        {error !== undefined && sentTo === null && (
          <Alert variant="destructive">
            {intl.formatMessage(
              MAGIC_LINK_ERRORS.has(error)
                ? messages.linkInvalid
                : messages.didNotComplete,
            )}
          </Alert>
        )}
        {unavailable && (
          <Paragraph role="alert">
            {intl.formatMessage(messages.unavailable)}
          </Paragraph>
        )}
        {!unavailable && sentTo === null && (
          <>
            {showMagicLinkForm && (
              <>
                <Paragraph>
                  {intl.formatMessage(messages.magicLinkIntro)}
                </Paragraph>
                <Form
                  onSubmit={async (values) => {
                    const email =
                      typeof values.email === 'string' ? values.email : '';
                    const failed = {
                      success: false,
                      formErrors: [
                        intl.formatMessage(messages.magicLinkSendFailed),
                      ],
                    };
                    let result;
                    try {
                      result = await authClient.signIn.magicLink({
                        email,
                        callbackURL,
                        errorCallbackURL,
                      });
                    } catch {
                      // Unhandled, a rejection would leave the form stuck
                      // submitting.
                      return failed;
                    }
                    if (result.error) return failed;
                    setSentTo(email);
                    return { success: true };
                  }}
                >
                  <Field
                    name="email"
                    label={intl.formatMessage(messages.emailLabel)}
                    component={InputField}
                    type="email"
                    required
                    pattern={studioEmailPattern(
                      intl,
                      intl.formatMessage(messages.emailHint),
                    )}
                    autoComplete="email"
                  />
                  <SubmitButton>
                    {intl.formatMessage(messages.sendLink)}
                  </SubmitButton>
                </Form>
              </>
            )}
            {showPasswordForm && (
              <>
                <Paragraph>
                  {intl.formatMessage(messages.passwordIntro)}
                </Paragraph>
                <Form
                  onSubmit={async (values) => {
                    const email =
                      typeof values.email === 'string' ? values.email : '';
                    const password =
                      typeof values.password === 'string'
                        ? values.password
                        : '';
                    const failed = {
                      success: false,
                      formErrors: [
                        intl.formatMessage(messages.wrongCredentials),
                      ],
                    };
                    let result;
                    try {
                      result = await authClient.signIn.email({
                        email,
                        password,
                      });
                    } catch {
                      // Unhandled, a rejection would leave the form stuck
                      // submitting.
                      return {
                        success: false,
                        formErrors: [
                          intl.formatMessage(messages.didNotComplete),
                        ],
                      };
                    }
                    if (result.error) return failed;
                    // Unlike magic-link and social, this completes inside the
                    // SPA with the session in the response — no document
                    // load is coming to read it. Recording the answer here
                    // is correct on the next guard with no round trip and no
                    // race (see the comment on sessionQueryOptions).
                    // Invalidating instead of navigating directly lets this
                    // route's own guard resolve where a signed-in visitor
                    // belongs, including the invitation destination, exactly
                    // as it already does for every other arrival.
                    queryClient.setQueryData(
                      sessionQueryOptions.queryKey,
                      'signedIn',
                    );
                    await router.invalidate();
                    return { success: true };
                  }}
                >
                  <Field
                    name="email"
                    label={intl.formatMessage(messages.emailLabel)}
                    component={InputField}
                    type="email"
                    required
                    pattern={studioEmailPattern(
                      intl,
                      intl.formatMessage(messages.emailHint),
                    )}
                    autoComplete="email"
                  />
                  <Field
                    name="password"
                    label={intl.formatMessage(messages.passwordLabel)}
                    component={PasswordField}
                    required
                    autoComplete="current-password"
                  />
                  <SubmitButton>
                    {intl.formatMessage(messages.submit)}
                  </SubmitButton>
                </Form>
              </>
            )}
            {canTogglePasswordMode && (
              <Button
                variant="link"
                size="sm"
                onClick={() =>
                  setMode(showPasswordForm ? 'magic-link' : 'password')
                }
              >
                {intl.formatMessage(
                  showPasswordForm
                    ? messages.useMagicLink
                    : messages.usePassword,
                )}
              </Button>
            )}
            {socialProviders.length > 0 && (
              <>
                {(showMagicLinkForm || showPasswordForm) && (
                  <div
                    aria-hidden="true"
                    className="my-4 flex items-center gap-3 before:h-px before:flex-1 before:bg-current/20 after:h-px after:flex-1 after:bg-current/20"
                  >
                    {intl.formatMessage(messages.orDivider)}
                  </div>
                )}
                {socialFailed && (
                  <Alert variant="destructive">
                    {intl.formatMessage(messages.socialFailed)}
                  </Alert>
                )}
                <div className="flex flex-col items-stretch gap-4">
                  {socialProviders.map((provider) => (
                    <Button
                      key={provider}
                      variant="outline"
                      disabled={socialPending !== null}
                      aria-busy={socialPending === provider}
                      icon={
                        socialPending === provider ? (
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
            )}
          </>
        )}
        <Paragraph role="status" ref={sentRef} tabIndex={-1}>
          {sentTo !== null &&
            intl.formatMessage(messages.sentTo, { email: sentTo })}
        </Paragraph>
        {sentTo !== null && (
          <Button size="sm" onClick={() => setSentTo(null)}>
            {intl.formatMessage(messages.useDifferentEmail)}
          </Button>
        )}
      </Surface>
    </main>
  );
}
