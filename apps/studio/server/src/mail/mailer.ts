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

  override toJSON(): MailOutcome {
    return mailOutcome(this);
  }
}

/**
 * The transport refused the send. The message is the transport's own, because
 * that is what lands on the job row and what an operator reads — nodemailer's
 * `Greeting never received` among them.
 */
export class MailFailed extends Schema.TaggedError<MailFailed>()('MailFailed', {
  cause: Schema.Defect(),
}) {
  override get message(): string {
    return this.cause instanceof Error
      ? this.cause.message
      : String(this.cause);
  }

  override toJSON(): MailOutcome {
    return mailOutcome(this);
  }
}

/** What pg-boss stores in a failed job's `output` column. */
type MailOutcome = { readonly _tag: string; readonly message: string };

/**
 * Why a send failed, in the one place an operator can read it: the job row.
 *
 * pg-boss serialises a thrown error with `serialize-error`, which takes an
 * object's own `toJSON` in preference to walking it — and the schema's `toJSON`
 * renders the declared fields, where the message is a getter rather than a
 * field and a `Defect` cause encodes to `{}`. Left at that, every failed mail
 * job would record `{"_tag":"MailFailed","cause":{}}` and the transport's own
 * reason would be gone.
 */
function mailOutcome(error: MailFailed | MailNotConfigured): MailOutcome {
  return { _tag: error._tag, message: error.message };
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

export type MagicLinkMailer = {
  sendMagicLink(input: MagicLinkInput): Promise<void>;
};

export type InvitationMailer = {
  sendTeamInvitation(input: TeamInvitationInput): Promise<void>;
};

export type StudioMailer = MagicLinkMailer & InvitationMailer;

/**
 * The Promise-shaped view the job handlers still take. Stage 5 rewrites them
 * onto the service itself; until then this is the one adapter, and it carries
 * the program's own services — its loggers and its tracer — into a send that a
 * pg-boss callback started, rather than letting it run on a bare runtime.
 */
export function promiseMailer(
  mailer: Mailer['Service'],
  services: Context.Context<never>,
): StudioMailer {
  const run = Effect.runPromiseWith(services);
  return {
    sendMagicLink: (input) => run(mailer.sendMagicLink(input)),
    sendTeamInvitation: (input) => run(mailer.sendTeamInvitation(input)),
  };
}
