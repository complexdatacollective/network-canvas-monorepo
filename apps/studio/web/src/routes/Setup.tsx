import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';

import { defineMessages } from '@codaco/app-i18n/messages';
import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import type { SuccessOf } from '@codaco/effect-query/types';
import Button from '@codaco/fresco-ui/Button';
import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import PasswordField from '@codaco/fresco-ui/form/fields/PasswordField';
import Form from '@codaco/fresco-ui/form/Form';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { routeFocusTargetProps } from '@codaco/fresco-ui/navigation/RouteFocus';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Unauthorized } from '@codaco/studio-contract/schema/errors';

import { invalidateInstanceStatus } from '../lib/deployment.ts';
import { studioEmailPattern } from '../lib/emailValidation.ts';
import { sessionQueryOptions } from '../lib/session.ts';
import { isConflict, isNotFound } from '../runtime/errors.ts';
import { rpcCall } from '../runtime/rpc.ts';
import type { StudioRpcsType } from '../runtime/runtime.ts';

// First-run setup (#1909). The one screen an instance nobody owns can serve:
// the operator brings the token the schema step printed, names the instance,
// and creates the account that owns it. The procedure signs them in as it
// completes, so this screen's success path is a navigation rather than a
// second trip through `/sign-in`.
//
// Its guard (src/router.tsx) 404s the route the moment an owner exists, which
// is why nothing here defends against being opened on a live instance beyond
// reporting what the server says if it is.

const messages = defineMessages({
  heading: {
    id: 'studio.setup.heading',
    defaultMessage: 'First-run setup',
    description: 'Heading of the first-run setup screen at /setup.',
  },
  intro: {
    id: 'studio.setup.intro',
    defaultMessage:
      'Nobody owns this instance yet. Enter the setup token printed when its database was created, then create the account that will own it.',
    description: 'Introduction on the first-run setup screen.',
  },
  tokenLabel: {
    id: 'studio.setup.tokenLabel',
    defaultMessage: 'Setup token',
    description: 'Label of the setup token field.',
  },
  tokenHint: {
    id: 'studio.setup.tokenHint',
    defaultMessage:
      'Printed once, by the command that created this instance’s database.',
    description: 'Hint under the setup token field.',
  },
  instanceNameLabel: {
    id: 'studio.setup.instanceNameLabel',
    defaultMessage: 'Name of this instance',
    description: 'Label of the instance name field.',
  },
  instanceNameHint: {
    id: 'studio.setup.instanceNameHint',
    defaultMessage:
      'What everyone who uses this instance will see it called, such as your department or project.',
    description: 'Hint under the instance name field.',
  },
  ownerNameLabel: {
    id: 'studio.setup.ownerNameLabel',
    defaultMessage: 'Your name',
    description: "Label of the owner's name field.",
  },
  emailLabel: {
    id: 'studio.setup.emailLabel',
    defaultMessage: 'Your email address',
    description: "Label of the owner's email field.",
  },
  emailHint: {
    id: 'studio.setup.emailHint',
    defaultMessage: 'The address you will sign in with.',
    description:
      "Hint under the owner's email field when the value is not a valid address.",
  },
  passwordLabel: {
    id: 'studio.setup.passwordLabel',
    defaultMessage: 'Choose a password',
    description: "Label of the owner's password field.",
  },
  submit: {
    id: 'studio.setup.submit',
    defaultMessage: 'Set up this instance',
    description: 'Submit button of the first-run setup form.',
  },
  wrongToken: {
    id: 'studio.setup.wrongToken',
    defaultMessage:
      'That setup token is not valid. Run the database command again to print a new one.',
    description: 'Form error when the setup token was refused.',
  },
  alreadySetUp: {
    id: 'studio.setup.alreadySetUp',
    defaultMessage:
      'This instance has already been set up. Sign in with the owner’s account.',
    description:
      'Form error when setup was completed by somebody else while this screen was open.',
  },
  emailTaken: {
    id: 'studio.setup.emailTaken',
    defaultMessage:
      'That email address already has an account here. Enter its password, or use a different address.',
    description:
      'Form error when the chosen email address already belongs to an account.',
  },
  failed: {
    id: 'studio.setup.failed',
    defaultMessage: 'Setup did not complete. Wait a moment and try again.',
    description: 'Form error when first-run setup failed for another reason.',
  },
  closedHeading: {
    id: 'studio.setup.closedHeading',
    defaultMessage: 'Setup is complete',
    description:
      'Heading shown at /setup on an instance that already has an owner.',
  },
  closedBody: {
    id: 'studio.setup.closedBody',
    defaultMessage:
      'This instance has already been set up, so there is nothing to do here.',
    description:
      'Explanation shown at /setup on an instance that already has an owner.',
  },
  closedSignIn: {
    id: 'studio.setup.closedSignIn',
    defaultMessage: 'Go to sign in',
    description:
      'Link from the closed first-run setup screen to the sign-in screen.',
  },
});

// Every bound below mirrors `CompleteSetupInput` in `@codaco/studio-contract`
// exactly — 256, 120, 320, 320, and 8 to 128, better-auth's own password
// window. The contract refuses anything outside them, so a field that did not
// would send a submission the server was always going to reject and report it
// as the generic failure rather than on the field that is wrong.

/** The value of a field the form hands back, which is typed as unknown. */
function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export default function Setup() {
  const intl = useAppIntl();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return (
    // Every route in §5.2 renders exactly one `<main id="main-content">`
    // (§11.2), and a focused screen has no area layout to own that landmark.
    <main
      id="main-content"
      className="flex h-full items-center justify-center p-4"
    >
      <Surface maxWidth="xl" spacing="lg">
        <Heading level="h1" {...routeFocusTargetProps}>
          {intl.formatMessage(messages.heading)}
        </Heading>
        <Paragraph>{intl.formatMessage(messages.intro)}</Paragraph>
        <Form
          onSubmit={async (values) => {
            const failure = (message: MessageDescriptor) => ({
              success: false as const,
              formErrors: [intl.formatMessage(message)],
            });
            let completed: SuccessOf<StudioRpcsType, 'setup.complete'>;
            try {
              completed = await rpcCall('setup.complete', {
                token: text(values.token),
                instanceName: text(values.instanceName),
                owner: {
                  name: text(values.ownerName),
                  email: text(values.email),
                  password: text(values.password),
                },
              });
            } catch (error) {
              // The procedure's three declared refusals, as the instances the
              // contract sends rather than as transport codes: a wrong or
              // missing token, an instance that already has an owner, and an
              // email address somebody has already used.
              if (error instanceof Unauthorized) {
                return failure(messages.wrongToken);
              }
              if (isNotFound(error)) {
                return failure(messages.alreadySetUp);
              }
              if (isConflict(error)) {
                return failure(messages.emailTaken);
              }
              return failure(messages.failed);
            }

            // Status has changed whatever else did: the instance has a name
            // and an owner, so setup is closed and this route is about to
            // become a not-found.
            await invalidateInstanceStatus(queryClient);
            // Only when the response actually carried the new owner's session
            // cookie, which is what `signedIn` reports. Recorded rather than
            // invalidated, for the reason `sessionQueryOptions` gives — but it
            // is a record of established fact, so it must not be written when
            // the fact is that no session was established.
            if (completed.signedIn) {
              queryClient.setQueryData(
                sessionQueryOptions.queryKey,
                'signedIn',
              );
            }
            // `/` resolves either way: to this researcher's landing
            // destination when they are signed in, and to the way in when they
            // are not.
            await navigate({ to: '/' });
            return { success: true };
          }}
        >
          <Field
            name="token"
            label={intl.formatMessage(messages.tokenLabel)}
            hint={intl.formatMessage(messages.tokenHint)}
            component={InputField}
            required
            maxLength={256}
            autoComplete="off"
          />
          <Field
            name="instanceName"
            label={intl.formatMessage(messages.instanceNameLabel)}
            hint={intl.formatMessage(messages.instanceNameHint)}
            component={InputField}
            required
            maxLength={120}
          />
          <Field
            name="ownerName"
            label={intl.formatMessage(messages.ownerNameLabel)}
            component={InputField}
            required
            maxLength={320}
            autoComplete="name"
          />
          <Field
            name="email"
            label={intl.formatMessage(messages.emailLabel)}
            component={InputField}
            type="email"
            required
            maxLength={320}
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
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
          />
          <SubmitButton>{intl.formatMessage(messages.submit)}</SubmitButton>
        </Form>
      </Surface>
    </main>
  );
}

/**
 * What `/setup` is once somebody owns the instance: the route's guard throws
 * `notFound()` and this renders in its place. The client has no global
 * not-found screen, and an address that answers with nothing at all would read
 * as a broken instance to the one person most likely to try it.
 */
export function SetupClosed() {
  const intl = useAppIntl();
  return (
    <main
      id="main-content"
      className="flex h-full items-center justify-center p-4"
    >
      <Surface maxWidth="xl" spacing="lg">
        <Heading level="h1" {...routeFocusTargetProps}>
          {intl.formatMessage(messages.closedHeading)}
        </Heading>
        <Paragraph>{intl.formatMessage(messages.closedBody)}</Paragraph>
        <Button asChild>
          <Link to="/sign-in">{intl.formatMessage(messages.closedSignIn)}</Link>
        </Button>
      </Surface>
    </main>
  );
}
