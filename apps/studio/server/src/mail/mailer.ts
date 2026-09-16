import { Context, Effect, Layer, Schema } from 'effect';

import type { TeamRole } from '@codaco/studio-rpc';

// What Studio can send, and nothing about how. The transport lives in
// src/mail/smtp.ts and the choice between them in src/mail/live.ts, so that
// this module — the one every handler and every test imports — pulls in no
// nodemailer, no sockets and no configuration.

/**
 * No transport at all. A supported state rather than a refusal (#1895): the
 * worker leaves the mail queues unworked and says so, and this is what a send
 * attempted anyway answers with.
 */
export class MailNotConfigured extends Schema.TaggedError<MailNotConfigured>()(
  'MailNotConfigured',
  { what: Schema.Literals(['sign-in email', 'invitation']) },
) {
  override get message(): string {
    return `No SMTP transport is configured; cannot send ${this.what}`;
  }
}

/**
 * The transport refused the send. The message is the transport's own, because
 * that is what lands in the job row's `last_error` and what an operator reads —
 * nodemailer's `Greeting never received` among them. The queue reads it through
 * `deepestMessage` (src/jobs/effect/errors.ts), which walks the cause chain for
 * exactly this getter.
 */
export class MailFailed extends Schema.TaggedError<MailFailed>()('MailFailed', {
  cause: Schema.Defect(),
}) {
  override get message(): string {
    return this.cause instanceof Error
      ? this.cause.message
      : String(this.cause);
  }
}

export type MagicLinkInput = { email: string; url: string };

export type TeamInvitationInput = {
  email: string;
  expiresAt: Date;
  invitationUrl: string;
  inviterLabel: string;
  messageId: string;
  role: TeamRole;
  teamLabel: string;
};

export class Mailer extends Context.Service<
  Mailer,
  {
    readonly sendMagicLink: (
      input: MagicLinkInput,
    ) => Effect.Effect<void, MailFailed | MailNotConfigured>;
    readonly sendTeamInvitation: (
      input: TeamInvitationInput,
    ) => Effect.Effect<void, MailFailed | MailNotConfigured>;
  }
>()('@studio/Mailer') {
  /** The development sign-in and invitation loops: the link goes to the log. */
  static readonly layerConsole: Layer.Layer<Mailer> = Layer.succeed(
    Mailer,
    Mailer.of({
      sendMagicLink: ({ email, url }) =>
        Effect.log(`Magic link for ${email}: ${url}`),
      sendTeamInvitation: ({ email, invitationUrl, teamLabel }) =>
        Effect.log(`Invitation to ${teamLabel} for ${email}: ${invitationUrl}`),
    }),
  );

  /** No transport configured. Every send fails, naming what it could not send. */
  static readonly layerRefuse: Layer.Layer<Mailer> = Layer.succeed(
    Mailer,
    Mailer.of({
      sendMagicLink: () =>
        Effect.fail(new MailNotConfigured({ what: 'sign-in email' })),
      sendTeamInvitation: () =>
        Effect.fail(new MailNotConfigured({ what: 'invitation' })),
    }),
  );
}
