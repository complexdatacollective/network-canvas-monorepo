import { useQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { type ReactNode, useEffect, useRef, useState } from 'react';

import { Alert } from '@codaco/fresco-ui/Alert';
import Button from '@codaco/fresco-ui/Button';
import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Form from '@codaco/fresco-ui/form/Form';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import Surface from '@codaco/fresco-ui/layout/Surface';
import Spinner from '@codaco/fresco-ui/Spinner';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import { orpc } from '../lib/api.ts';
import { authClient } from '../lib/auth.ts';
import { GoogleIcon, MicrosoftIcon } from './ProviderIcons.tsx';

const route = getRouteApi('/sign-in');

type SocialProvider = 'google' | 'microsoft';

const PROVIDERS: Record<SocialProvider, { label: string; icon: ReactNode }> = {
  google: { label: 'Continue with Google', icon: <GoogleIcon /> },
  microsoft: { label: 'Continue with Microsoft', icon: <MicrosoftIcon /> },
};

// The magic-link verify redirect's error codes; every other `?error=` value
// on this page comes from an OAuth round trip that did not complete.
const MAGIC_LINK_ERRORS = new Set(['EXPIRED_TOKEN', 'INVALID_TOKEN']);

export default function SignIn() {
  const { error } = route.useSearch();
  const status = useQuery(orpc.status.queryOptions());
  const [sentTo, setSentTo] = useState<string | null>(null);
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

  // Only a definitive "auth is not configured" hides the form; not knowing
  // (the status query failing) must not lock the door.
  const unavailable = status.isSuccess && !status.data.auth.enabled;

  // Rendered only from definitive status data: starting a sign-in with an
  // unconfigured provider would fail at the server.
  const socialProviders = status.data?.auth.socialProviders ?? [];

  const signInWith = async (provider: SocialProvider) => {
    setSocialFailed(false);
    setSocialPending(provider);
    const result = await authClient.signIn.social({
      provider,
      callbackURL: '/',
      // better-auth appends its own ?error=<code> on failure.
      errorCallbackURL: '/sign-in',
    });
    if (result.error) {
      setSocialPending(null);
      setSocialFailed(true);
    }
    // On success the browser is navigating to the provider; the button stays
    // busy until the page unloads.
  };

  return (
    <main className="flex h-full items-center justify-center p-4">
      <Surface className="max-w-xl" spacing="lg">
        <Heading level="h1">Sign in</Heading>
        {error !== undefined && sentTo === null && (
          <Alert variant="destructive">
            {MAGIC_LINK_ERRORS.has(error)
              ? 'That sign-in link is no longer valid. Enter your email address to request a new one.'
              : 'Sign-in did not complete. Try again.'}
          </Alert>
        )}
        {unavailable && (
          <Paragraph role="alert">
            Sign-in is not available on this server. Contact the person who runs
            it.
          </Paragraph>
        )}
        {!unavailable && sentTo === null && (
          <>
            <Paragraph>
              Enter your email address and we will send you a sign-in link.
            </Paragraph>
            <Form
              onSubmit={async (values) => {
                const email = String(values.email ?? '');
                const result = await authClient.signIn.magicLink({
                  email,
                  callbackURL: '/',
                  // better-auth appends its own ?error=<code> on failure.
                  errorCallbackURL: '/sign-in',
                });
                if (result.error) {
                  return {
                    success: false,
                    formErrors: [
                      'The sign-in email could not be sent. Wait a moment and try again.',
                    ],
                  };
                }
                setSentTo(email);
                return { success: true };
              }}
            >
              <Field
                name="email"
                label="Email address"
                component={InputField}
                type="email"
                required
                pattern={{
                  regex: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
                  hint: 'The address you use for Studio.',
                  errorMessage: 'Enter a valid email address.',
                }}
                autoComplete="email"
              />
              <SubmitButton>Send sign-in link</SubmitButton>
            </Form>
            {socialProviders.length > 0 && (
              <>
                <div className="my-4 flex items-center gap-3 before:h-px before:flex-1 before:bg-current/20 after:h-px after:flex-1 after:bg-current/20">
                  or
                </div>
                {socialFailed && (
                  <Alert variant="destructive">
                    Sign-in could not be started. Wait a moment and try again.
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
                      {PROVIDERS[provider].label}
                    </Button>
                  ))}
                </div>
              </>
            )}
          </>
        )}
        {/* Live region so the send is announced without a focus change. */}
        <Paragraph role="status" ref={sentRef} tabIndex={-1}>
          {sentTo !== null && (
            <>
              We sent a sign-in link to {sentTo}. Open it on this device to
              continue. The link expires in 5 minutes.
            </>
          )}
        </Paragraph>
        {sentTo !== null && (
          <Button size="sm" onClick={() => setSentTo(null)}>
            Use a different email address
          </Button>
        )}
      </Surface>
    </main>
  );
}
