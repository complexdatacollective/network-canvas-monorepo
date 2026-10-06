import { Effect, Layer } from 'effect';
import nodemailer from 'nodemailer';

import { UPGRADE_GUIDE_URL } from '@codaco/studio-contract/surfaces';

import {
  MailFailed,
  Mailer,
  type MagicLinkInput,
  type TeamInvitationInput,
  type UpdateNoticeInput,
} from './mailer.ts';

// The only module in the server that imports nodemailer, which
// src/__tests__/process-separation.test.ts holds.

/** The update notice, as a pure function so its wording is tested without a transport. */
export function updateNoticeMessage({
  name,
  version,
  notesUrl,
  schemaChange,
  deploymentMode,
}: UpdateNoticeInput): { readonly subject: string; readonly text: string } {
  return {
    subject: `Network Canvas Studio ${version} is available`,
    text: [
      `Hello ${name},`,
      '',
      `Network Canvas Studio ${version} has been released. You are receiving this because you own this Studio installation.`,
      '',
      'Release notes:',
      notesUrl,
      '',
      schemaChange
        ? 'Upgrading to this release changes the database. Rolling back means restoring the backup taken during the upgrade.'
        : 'Upgrading to this release does not change the database.',
      ...(deploymentMode === 'self-hosted'
        ? [
            '',
            'To upgrade, follow the upgrade guide in the self-hosting documentation:',
            UPGRADE_GUIDE_URL,
          ]
        : []),
      '',
      'This message is sent once for each new release.',
    ].join('\n'),
  };
}

export function MailerSmtp(transport: {
  readonly url: string;
  readonly from: string;
}): Layer.Layer<Mailer> {
  return Layer.effect(
    Mailer,
    Effect.gen(function* () {
      // nodemailer's defaults are longer than anything that waits on a send.
      const sender = yield* Effect.acquireRelease(
        Effect.sync(() =>
          nodemailer.createTransport({
            url: transport.url,
            connectionTimeout: 10_000,
            greetingTimeout: 10_000,
            socketTimeout: 20_000,
          }),
        ),
        (open) => Effect.sync(() => open.close()),
      );

      const send = Effect.fnUntraced(function* (message: {
        readonly to: string;
        readonly subject: string;
        readonly text: string;
        readonly messageId?: string;
      }) {
        yield* Effect.tryPromise({
          try: () => sender.sendMail({ from: transport.from, ...message }),
          catch: (cause) => new MailFailed({ cause }),
        });
      });

      return Mailer.of({
        sendMagicLink: ({ email, url }: MagicLinkInput) =>
          send({
            to: email,
            subject: 'Sign in to Network Canvas Studio',
            text: [
              'Use this link to sign in to Network Canvas Studio:',
              '',
              url,
              '',
              'The link expires in 5 minutes and can be used once.',
              'If you did not request it, you can ignore this email.',
            ].join('\n'),
          }),
        sendTeamInvitation: ({
          email,
          expiresAt,
          invitationUrl,
          inviterLabel,
          messageId,
          role,
          teamLabel,
        }: TeamInvitationInput) =>
          send({
            to: email,
            messageId,
            subject: `Invitation to join ${teamLabel} in Network Canvas Studio`,
            text: [
              `${inviterLabel} invited you to join ${teamLabel} in Network Canvas Studio.`,
              '',
              `Your team role will be ${role}.`,
              '',
              'Review and accept the invitation:',
              invitationUrl,
              '',
              `The invitation expires ${expiresAt.toUTCString()}.`,
              'If you were not expecting this invitation, you can ignore this email.',
            ].join('\n'),
          }),
        sendUpdateNotice: (input: UpdateNoticeInput) =>
          send({ to: input.email, ...updateNoticeMessage(input) }),
      });
    }),
  );
}
