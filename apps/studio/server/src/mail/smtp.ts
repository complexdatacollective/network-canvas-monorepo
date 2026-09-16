import { Effect, Layer } from 'effect';
import nodemailer from 'nodemailer';

import {
  MailFailed,
  Mailer,
  type MagicLinkInput,
  type TeamInvitationInput,
} from './mailer.ts';

// The only module in the server that imports nodemailer, which
// src/__tests__/process-separation.test.ts holds: a transport reachable from
// the web process's graph would put SMTP credentials in a process that has no
// business holding them (#1895).

export function MailerSmtp(transport: {
  readonly url: string;
  readonly from: string;
}): Layer.Layer<Mailer> {
  return Layer.effect(
    Mailer,
    Effect.gen(function* () {
      // nodemailer's defaults — 2 minutes to connect, 30 seconds for a
      // greeting, 10 minutes of socket inactivity — are longer than anything
      // that waits on a send: the invitation queue expires an attempt after 60
      // seconds, and the worker gives an in-flight handler 25 seconds when a
      // container stops it, after which pg-boss fails the job as 'shut down
      // while active' rather than letting it retry. These bounds fit inside
      // both.
      //
      // Before nodemailer 10, `createTransport` discarded every other key of a
      // configuration object that carried a `url`, so these timeouts had to be
      // set through an SMTPTransport built by hand. 10.0.0 applies them beside
      // the URL; src/mail/__tests__/smtp.test.ts holds the bound either way.
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
      });
    }),
  );
}
