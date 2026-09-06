import { ORPCError } from '@orpc/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert } from '@codaco/fresco-ui/Alert';
import { Button } from '@codaco/fresco-ui/Button';
import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import PasswordField from '@codaco/fresco-ui/form/fields/PasswordField';
import Form from '@codaco/fresco-ui/form/Form';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { routeFocusTargetProps } from '@codaco/fresco-ui/navigation/RouteFocus';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { CompleteSetupInputSchema } from '@codaco/studio-rpc';

import { orpc, rpcClient } from '../lib/api.ts';
import { studioEmailPattern } from '../lib/emailValidation.ts';
import ScreenMain from '../shell/ScreenMain.tsx';

const messages = defineMessages({
  heading: {
    id: 'studio.setup.heading',
    defaultMessage: 'First-run setup',
    description: 'Heading of the self-hosted first-run setup screen.',
  },
  introduction: {
    id: 'studio.setup.introduction',
    defaultMessage:
      'Name this Studio instance and create its first owner account. Your first team will use the same name.',
    description: 'Explains what completing setup creates.',
  },
  loading: {
    id: 'studio.setup.loading',
    defaultMessage: 'Checking setup availability…',
    description: 'Status while the first-run state loads.',
  },
  loadFailed: {
    id: 'studio.setup.loadFailed',
    defaultMessage: 'Setup availability could not be checked. Try again.',
    description: 'Error when the setup state request fails.',
  },
  retry: {
    id: 'studio.setup.retry',
    defaultMessage: 'Try again',
    description: 'Retries loading the setup state.',
  },
  unavailable: {
    id: 'studio.setup.unavailable',
    defaultMessage:
      'First-run setup is unavailable. If you already have an account, sign in. Otherwise, contact the person configuring this server.',
    description:
      'Shown when the server has existing accounts or is not configured for first-run setup.',
  },
  complete: {
    id: 'studio.setup.complete',
    defaultMessage: 'Setup is complete. Sign in to continue.',
    description:
      'Confirmation after setup, also shown when reopening the completed setup page.',
  },
  signIn: {
    id: 'studio.setup.signIn',
    defaultMessage: 'Sign in',
    description: 'Link from setup to the sign-in screen.',
  },
  instanceName: {
    id: 'studio.setup.instanceName',
    defaultMessage: 'Instance name',
    description: 'Label for the installation and initial team name.',
  },
  ownerName: {
    id: 'studio.setup.ownerName',
    defaultMessage: 'Your name',
    description: 'Label for the first owner display name.',
  },
  nameHint: {
    id: 'studio.setup.nameHint',
    defaultMessage: 'Use 1–120 characters.',
    description: 'Hint for the instance and owner names.',
  },
  nameInvalid: {
    id: 'studio.setup.nameInvalid',
    defaultMessage: 'Enter a name.',
    description: 'Validation for a name containing only whitespace.',
  },
  email: {
    id: 'studio.setup.email',
    defaultMessage: 'Email address',
    description: 'Label for the first owner email address.',
  },
  emailHint: {
    id: 'studio.setup.emailHint',
    defaultMessage: 'The address you will use to sign in.',
    description: 'Hint for the first owner email address.',
  },
  password: {
    id: 'studio.setup.password',
    defaultMessage: 'Password',
    description: 'Label for the first owner password.',
  },
  passwordHint: {
    id: 'studio.setup.passwordHint',
    defaultMessage: 'Use 12–128 characters.',
    description: 'Password length hint.',
  },
  token: {
    id: 'studio.setup.token',
    defaultMessage: 'Setup token',
    description: 'Label for the secret token that authorizes initial setup.',
  },
  tokenHint: {
    id: 'studio.setup.tokenHint',
    defaultMessage:
      'Enter the token provided by the person configuring this server.',
    description: 'Explains where to obtain the setup token.',
  },
  tokenInvalid: {
    id: 'studio.setup.tokenInvalid',
    defaultMessage: 'That setup token is not valid. Check it and try again.',
    description: 'Field error when the server refuses the setup token.',
  },
  submit: {
    id: 'studio.setup.submit',
    defaultMessage: 'Create instance',
    description: 'Completes the first-run setup form.',
  },
  failed: {
    id: 'studio.setup.failed',
    defaultMessage:
      'Setup could not be completed. Check the details and try again.',
    description: 'Safe form error when the setup request fails.',
  },
  notFound: {
    id: 'studio.setup.notFound',
    defaultMessage: 'Page not found',
    description: 'Heading when setup is visited on a managed deployment.',
  },
  notFoundDescription: {
    id: 'studio.setup.notFoundDescription',
    defaultMessage: 'This page is not available on this server.',
    description: 'Explanation when setup is visited on a managed deployment.',
  },
});

export function SetupNotFound() {
  const intl = useAppIntl();
  return (
    <ScreenMain>
      <Surface maxWidth="xl" spacing="lg">
        <Heading level="h1" {...routeFocusTargetProps}>
          {intl.formatMessage(messages.notFound)}
        </Heading>
        <Paragraph>
          {intl.formatMessage(messages.notFoundDescription)}
        </Paragraph>
      </Surface>
    </ScreenMain>
  );
}

export default function Setup() {
  const intl = useAppIntl();
  const queryClient = useQueryClient();
  const status = useQuery(orpc.setup.status.queryOptions({ retry: false }));
  const completion = useRef<HTMLParagraphElement>(null);
  const complete = status.data?.state === 'complete';
  useEffect(() => {
    if (complete) completion.current?.focus();
  }, [complete]);
  const recordComplete = () =>
    queryClient.setQueryData(orpc.setup.status.queryOptions().queryKey, {
      state: 'complete',
    });
  const namePattern = {
    regex: '\\S',
    hint: intl.formatMessage(messages.nameHint),
    errorMessage: intl.formatMessage(messages.nameInvalid),
  };

  return (
    <main
      id="main-content"
      className="flex min-h-full justify-center p-4 sm:p-8"
    >
      <Surface maxWidth="xl" spacing="lg">
        <Heading level="h1" {...routeFocusTargetProps}>
          {intl.formatMessage(messages.heading)}
        </Heading>
        {status.isPending && (
          <Paragraph role="status">
            {intl.formatMessage(messages.loading)}
          </Paragraph>
        )}
        {status.isError && (
          <>
            <Alert variant="destructive">
              {intl.formatMessage(messages.loadFailed)}
            </Alert>
            <Button onClick={() => void status.refetch()}>
              {intl.formatMessage(messages.retry)}
            </Button>
          </>
        )}
        {complete && (
          <Paragraph ref={completion} role="status" tabIndex={-1}>
            {intl.formatMessage(messages.complete)}
          </Paragraph>
        )}
        {status.data?.state === 'unavailable' && (
          <Paragraph role="status">
            {intl.formatMessage(messages.unavailable)}
          </Paragraph>
        )}
        {(complete || status.data?.state === 'unavailable') && (
          <Link
            to="/sign-in"
            className="focusable text-primary underline underline-offset-4"
          >
            {intl.formatMessage(messages.signIn)}
          </Link>
        )}
        {status.data?.state === 'ready' && (
          <>
            <Paragraph>{intl.formatMessage(messages.introduction)}</Paragraph>
            <Form
              onSubmit={async (values) => {
                const parsed = CompleteSetupInputSchema.safeParse(values);
                const failed = {
                  success: false as const,
                  formErrors: [intl.formatMessage(messages.failed)],
                };
                const invalidToken = {
                  success: false as const,
                  fieldErrors: {
                    token: [intl.formatMessage(messages.tokenInvalid)],
                  },
                };
                if (!parsed.success)
                  return parsed.error.issues.some(
                    (issue) => issue.path[0] === 'token',
                  )
                    ? invalidToken
                    : failed;
                try {
                  await rpcClient.setup.complete(parsed.data);
                  recordComplete();
                  return { success: true };
                } catch (error) {
                  if (error instanceof ORPCError && error.code === 'CONFLICT') {
                    // A second operator completed setup, or a successful response
                    // was lost. The durable server state wins over this old form.
                    recordComplete();
                    return { success: true };
                  }
                  if (
                    error instanceof ORPCError &&
                    error.code === 'FORBIDDEN'
                  ) {
                    return invalidToken;
                  }
                  return failed;
                }
              }}
            >
              <Field
                name="instanceName"
                label={intl.formatMessage(messages.instanceName)}
                component={InputField}
                required
                minLength={1}
                maxLength={120}
                pattern={namePattern}
                autoComplete="organization"
              />
              <Field
                name="ownerName"
                label={intl.formatMessage(messages.ownerName)}
                component={InputField}
                required
                minLength={1}
                maxLength={120}
                pattern={namePattern}
                autoComplete="name"
              />
              <Field
                name="ownerEmail"
                label={intl.formatMessage(messages.email)}
                component={InputField}
                type="email"
                required
                maxLength={254}
                pattern={studioEmailPattern(
                  intl,
                  intl.formatMessage(messages.emailHint),
                )}
                autoComplete="email"
              />
              <Field
                name="ownerPassword"
                label={intl.formatMessage(messages.password)}
                component={PasswordField}
                required
                minLength={12}
                maxLength={128}
                hint={intl.formatMessage(messages.passwordHint)}
                autoComplete="new-password"
              />
              <Field
                name="token"
                label={intl.formatMessage(messages.token)}
                component={InputField}
                type="password"
                required
                minLength={43}
                maxLength={43}
                hint={intl.formatMessage(messages.tokenHint)}
                autoComplete="off"
              />
              <SubmitButton>{intl.formatMessage(messages.submit)}</SubmitButton>
            </Form>
          </>
        )}
      </Surface>
    </main>
  );
}
