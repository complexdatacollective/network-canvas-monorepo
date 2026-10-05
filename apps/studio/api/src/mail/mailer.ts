import { Context, Effect, Layer, Schema } from 'effect';

import type { TeamRole } from '@codaco/studio-contract/schema/team';

export class MailNotConfigured extends Schema.TaggedError<MailNotConfigured>()(
  'MailNotConfigured',
  { what: Schema.Literals(['sign-in email', 'invitation']) },
) {
  override get message(): string {
    return `No SMTP transport is configured; cannot send ${this.what}`;
  }
}

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
  static readonly layerConsole: Layer.Layer<Mailer> = Layer.succeed(
    Mailer,
    Mailer.of({
      sendMagicLink: ({ email, url }) =>
        Effect.log(`Magic link for ${email}: ${url}`),
      sendTeamInvitation: ({ email, invitationUrl, teamLabel }) =>
        Effect.log(`Invitation to ${teamLabel} for ${email}: ${invitationUrl}`),
    }),
  );

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
