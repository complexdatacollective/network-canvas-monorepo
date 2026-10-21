import { useQuery } from '@tanstack/react-query';
import { getRouteApi, Link } from '@tanstack/react-router';
import { useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Button from '@codaco/fresco-ui/Button';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { routeFocusTargetProps } from '@codaco/fresco-ui/navigation/RouteFocus';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import { useMaintenanceRevalidation } from '../lib/session.ts';
import { rpcQuery } from '../runtime/rpc.ts';
import MaintenanceNotice from '../shell/MaintenanceNotice.tsx';
import {
  CallbackErrorAlert,
  MagicLinkForm,
  type MethodWording,
  SentLinkConfirmation,
  SocialSignIn,
} from './SignInMethods.tsx';

const route = getRouteApi('/focused/sign-up');

const messages = defineMessages({
  heading: {
    id: 'studio.signUp.heading',
    defaultMessage: 'Create an account',
    description: 'Heading of the account creation screen at /sign-up.',
  },
  intro: {
    id: 'studio.signUp.intro',
    defaultMessage:
      'Create your Studio account, then name the team your studies will belong to.',
    description:
      'Introduction on the account creation screen, describing the two steps of signing up.',
  },
  magicLinkIntro: {
    id: 'studio.signUp.magicLinkIntro',
    defaultMessage:
      'Enter your email address and we will send you a link that creates your account.',
    description: 'Introduction above the magic-link form on /sign-up.',
  },
  sendLink: {
    id: 'studio.signUp.sendLink',
    defaultMessage: 'Send sign-up link',
    description: 'Submit button of the magic-link form on /sign-up.',
  },
  sentTo: {
    id: 'studio.signUp.sentTo',
    defaultMessage:
      'We sent a link to {email}. Open it on this device to create your account. The link expires in 5 minutes.',
    description:
      'Confirmation after a sign-up link was sent; {email} is the address it went to.',
  },
  unavailable: {
    id: 'studio.signUp.unavailable',
    defaultMessage:
      'Creating an account is not available right now. Try again later.',
    description:
      'Shown on /sign-up when the deployment offers neither email links nor Google or Microsoft sign-in.',
  },
  linkInvalid: {
    id: 'studio.signUp.linkInvalid',
    defaultMessage:
      'That sign-up link is no longer valid. Enter your email address to request a new one.',
    description:
      'Shown on /sign-up when a sign-up link the visitor followed has expired or was already used.',
  },
  didNotComplete: {
    id: 'studio.signUp.didNotComplete',
    defaultMessage: 'Creating your account did not complete. Try again.',
    description:
      'Shown on /sign-up when creating an account failed for an unspecified reason.',
  },
  magicLinkSendFailed: {
    id: 'studio.signUp.magicLinkSendFailed',
    defaultMessage:
      'The sign-up email could not be sent. Wait a moment and try again.',
    description:
      'Form error on /sign-up when requesting a sign-up link failed.',
  },
  socialFailed: {
    id: 'studio.signUp.socialFailed',
    defaultMessage:
      'Creating your account could not be started. Wait a moment and try again.',
    description:
      'Shown on /sign-up when handing off to Google or Microsoft failed.',
  },
  emailHint: {
    id: 'studio.signUp.emailHint',
    defaultMessage: 'The address your Studio account will use.',
    description:
      "Hint under /sign-up's email field when the value is not a valid address.",
  },
  haveAccount: {
    id: 'studio.signUp.haveAccount',
    defaultMessage: 'Already have an account? Sign in',
    description: 'Link from the account creation screen to the sign-in screen.',
  },
});

// Both routes into a new session come back here by a full document load, and
// this route's guard sends a researcher who already has a team on to their
// landing destination instead.
const SIGN_UP_WORDING: MethodWording = {
  linkInvalid: messages.linkInvalid,
  didNotComplete: messages.didNotComplete,
  magicLinkSendFailed: messages.magicLinkSendFailed,
  socialFailed: messages.socialFailed,
  emailHint: messages.emailHint,
};

const CALLBACK_URL = '/sign-up/team';
const ERROR_CALLBACK_URL = '/sign-up';

export default function SignUp() {
  const intl = useAppIntl();
  const { error } = route.useSearch();
  const status = useQuery(rpcQuery('status', undefined));
  useMaintenanceRevalidation();
  const [sentTo, setSentTo] = useState<string | null>(null);

  const auth = status.isSuccess ? status.data.auth : undefined;
  const magicLink = auth ? auth.magicLink : true;
  const socialProviders = auth?.socialProviders ?? [];
  const unavailable = auth
    ? !auth.enabled || (!auth.magicLink && auth.socialProviders.length === 0)
    : false;

  return (
    <main
      id="main-content"
      className="flex min-h-full items-center justify-center p-4"
    >
      <Surface maxWidth="xl" spacing="lg">
        <Heading level="h1" {...routeFocusTargetProps}>
          {intl.formatMessage(messages.heading)}
        </Heading>
        <MaintenanceNotice className="" />
        {error !== undefined && sentTo === null && (
          <CallbackErrorAlert error={error} wording={SIGN_UP_WORDING} />
        )}
        {unavailable && (
          <Paragraph role="alert">
            {intl.formatMessage(messages.unavailable)}
          </Paragraph>
        )}
        {!unavailable && sentTo === null && (
          <>
            <Paragraph>{intl.formatMessage(messages.intro)}</Paragraph>
            {magicLink && (
              <MagicLinkForm
                intro={messages.magicLinkIntro}
                submitLabel={messages.sendLink}
                callbackURL={CALLBACK_URL}
                errorCallbackURL={ERROR_CALLBACK_URL}
                onSent={setSentTo}
                wording={SIGN_UP_WORDING}
              />
            )}
            <SocialSignIn
              providers={socialProviders}
              callbackURL={CALLBACK_URL}
              errorCallbackURL={ERROR_CALLBACK_URL}
              divided={magicLink}
              wording={SIGN_UP_WORDING}
            />
          </>
        )}
        <SentLinkConfirmation
          sentTo={sentTo}
          message={messages.sentTo}
          onReset={() => setSentTo(null)}
        />
        {sentTo === null && (
          <Button asChild variant="link" size="sm">
            <Link to="/sign-in">
              {intl.formatMessage(messages.haveAccount)}
            </Link>
          </Button>
        )}
      </Surface>
    </main>
  );
}
