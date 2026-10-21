import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getRouteApi, Link, useRouter } from '@tanstack/react-router';
import { useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Button from '@codaco/fresco-ui/Button';
import Field from '@codaco/fresco-ui/form/Field/Field';
import PasswordField from '@codaco/fresco-ui/form/fields/PasswordField';
import Form from '@codaco/fresco-ui/form/Form';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { routeFocusTargetProps } from '@codaco/fresco-ui/navigation/RouteFocus';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import { authClient } from '../lib/auth.ts';
import {
  sessionQueryOptions,
  useMaintenanceRevalidation,
} from '../lib/session.ts';
import { rpcQuery } from '../runtime/rpc.ts';
import MaintenanceNotice from '../shell/MaintenanceNotice.tsx';
import {
  CallbackErrorAlert,
  EmailField,
  MagicLinkForm,
  SentLinkConfirmation,
  signInMethodMessages,
  SocialSignIn,
} from './SignInMethods.tsx';

const route = getRouteApi('/focused/sign-in');

const messages = defineMessages({
  heading: {
    id: 'studio.signIn.heading',
    defaultMessage: 'Sign in',
    description: 'Heading of the sign-in screen.',
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
  sentTo: {
    id: 'studio.signIn.sentTo',
    defaultMessage:
      'We sent a sign-in link to {email}. Open it on this device to continue. The link expires in 5 minutes.',
    description:
      'Confirmation after a magic sign-in link was sent; {email} is the address it went to.',
  },
  createAccount: {
    id: 'studio.signIn.createAccount',
    defaultMessage: 'New to Studio? Create an account',
    description:
      'Link from the sign-in screen to the account creation screen, shown on the managed service only.',
  },
});

export default function SignIn() {
  const intl = useAppIntl();
  const { error, invitationId } = route.useSearch();
  const status = useQuery(rpcQuery('status', undefined));
  useMaintenanceRevalidation();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [mode, setMode] = useState<'magic-link' | 'password'>('magic-link');

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
  // An invitation already says where this visit is going; creating an account
  // from here would take the invitee into a funnel that ends with a team of
  // their own instead of the one they were invited to.
  const offersSignUp =
    status.data?.deployment.mode === 'managed' && invitationId === undefined;

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
        <MaintenanceNotice className="" />
        {error !== undefined && sentTo === null && (
          <CallbackErrorAlert error={error} />
        )}
        {unavailable && (
          <Paragraph role="alert">
            {intl.formatMessage(messages.unavailable)}
          </Paragraph>
        )}
        {!unavailable && sentTo === null && (
          <>
            {showMagicLinkForm && (
              <MagicLinkForm
                intro={messages.magicLinkIntro}
                submitLabel={messages.sendLink}
                callbackURL={callbackURL}
                errorCallbackURL={errorCallbackURL}
                onSent={setSentTo}
              />
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
                          intl.formatMessage(
                            signInMethodMessages.didNotComplete,
                          ),
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
                  <EmailField />
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
            <SocialSignIn
              providers={socialProviders}
              callbackURL={callbackURL}
              errorCallbackURL={errorCallbackURL}
              divided={showMagicLinkForm || showPasswordForm}
            />
          </>
        )}
        <SentLinkConfirmation
          sentTo={sentTo}
          message={messages.sentTo}
          onReset={() => setSentTo(null)}
        />
        {offersSignUp && sentTo === null && (
          <Button asChild variant="link" size="sm">
            <Link to="/sign-up">
              {intl.formatMessage(messages.createAccount)}
            </Link>
          </Button>
        )}
      </Surface>
    </main>
  );
}
