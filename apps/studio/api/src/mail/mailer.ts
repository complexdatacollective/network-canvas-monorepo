import { Context, Effect, Layer, Schema } from 'effect';

import type { TeamRole } from '@codaco/studio-contract/schema/team';
import type { DeploymentMode } from '@codaco/studio-contract/surfaces';

// Server mail is English-only. The three templates (in `smtp.ts`) are inline
// text because Studio has no server-side message catalogue, and none is built
// for the few messages that need one; a message that must be localised waits
// for that catalogue rather than carrying a `locale` it ignores.

export class MailNotConfigured extends Schema.TaggedError<MailNotConfigured>()(
  'MailNotConfigured',
  { what: Schema.Literals(['sign-in email', 'invitation', 'update notice']) },
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

export type UpdateNoticeInput = {
  email: string;
  name: string;
  version: string;
  notesUrl: string;
  /**
   * Whether upgrading this instance to the release applies a migration, as the
   * update check decided against the running build; it decides what rolling
   * back means.
   */
  schemaChange: boolean;
  deploymentMode: DeploymentMode;
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
    readonly sendUpdateNotice: (
      input: UpdateNoticeInput,
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
      sendUpdateNotice: ({ email, version, notesUrl }) =>
        Effect.log(
          `Studio ${version} is available; notice for ${email}: ${notesUrl}`,
        ),
    }),
  );

  static readonly layerRefuse: Layer.Layer<Mailer> = Layer.succeed(
    Mailer,
    Mailer.of({
      sendMagicLink: () =>
        Effect.fail(new MailNotConfigured({ what: 'sign-in email' })),
      sendTeamInvitation: () =>
        Effect.fail(new MailNotConfigured({ what: 'invitation' })),
      sendUpdateNotice: () =>
        Effect.fail(new MailNotConfigured({ what: 'update notice' })),
    }),
  );
}
