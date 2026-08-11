import { useQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';

import { Alert } from '@codaco/fresco-ui/Alert';
import Button from '@codaco/fresco-ui/Button';
import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Form from '@codaco/fresco-ui/form/Form';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import Surface from '@codaco/fresco-ui/layout/Surface';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import { orpc } from '../lib/api.ts';
import { authClient } from '../lib/auth.ts';

const route = getRouteApi('/sign-in');

export default function SignIn() {
  const { error } = route.useSearch();
  const status = useQuery(orpc.status.queryOptions());
  const [sentTo, setSentTo] = useState<string | null>(null);
  const sentRef = useRef<HTMLParagraphElement>(null);

  // The form (and its focused submit button) unmounts on success; move
  // focus to the confirmation so keyboard users aren't dropped on body.
  useEffect(() => {
    if (sentTo !== null) sentRef.current?.focus();
  }, [sentTo]);

  // Only a definitive "auth is not configured" hides the form; not knowing
  // (the status query failing) must not lock the door.
  const unavailable = status.isSuccess && !status.data.auth.enabled;

  return (
    <main className="flex h-full items-center justify-center p-4">
      <Surface className="max-w-xl" spacing="lg">
        <Heading level="h1">Sign in</Heading>
        {error !== undefined && sentTo === null && (
          <Alert variant="destructive">
            That sign-in link is no longer valid. Enter your email address to
            request a new one.
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
