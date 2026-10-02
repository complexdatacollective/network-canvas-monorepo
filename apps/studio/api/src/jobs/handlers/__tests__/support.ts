import { Context, Effect, Layer } from 'effect';

import {
  type MagicLinkInput,
  type MailFailed,
  Mailer,
  type MailNotConfigured,
  type TeamInvitationInput,
} from '../../../mail/mailer.ts';

export type MailBehaviour<Input> = (
  input: Input,
  call: number,
) => Effect.Effect<void, MailFailed | MailNotConfigured>;

export type RecordedMailShape = {
  readonly invitations: TeamInvitationInput[];
  readonly magicLinks: MagicLinkInput[];
  readonly setInvitationBehaviour: (
    behaviour: MailBehaviour<TeamInvitationInput>,
  ) => Effect.Effect<void>;
  readonly setMagicLinkBehaviour: (
    behaviour: MailBehaviour<MagicLinkInput>,
  ) => Effect.Effect<void>;
  readonly clear: Effect.Effect<void>;
};

export class RecordedMail extends Context.Service<
  RecordedMail,
  RecordedMailShape
>()('@studio/jobs/test/RecordedMail') {}

export const layerRecordingMailer: Layer.Layer<Mailer | RecordedMail> =
  Layer.effectContext(
    Effect.sync(() => {
      const invitations: TeamInvitationInput[] = [];
      const magicLinks: MagicLinkInput[] = [];
      let invitationBehaviour: MailBehaviour<TeamInvitationInput> = () =>
        Effect.void;
      let magicLinkBehaviour: MailBehaviour<MagicLinkInput> = () => Effect.void;

      return Context.make(
        Mailer,
        Mailer.of({
          sendTeamInvitation: (input) =>
            Effect.suspend(() => {
              invitations.push(input);
              return invitationBehaviour(input, invitations.length);
            }),
          sendMagicLink: (input) =>
            Effect.suspend(() => {
              magicLinks.push(input);
              return magicLinkBehaviour(input, magicLinks.length);
            }),
        }),
      ).pipe(
        Context.add(
          RecordedMail,
          RecordedMail.of({
            invitations,
            magicLinks,
            setInvitationBehaviour: (behaviour) =>
              Effect.sync(() => {
                invitationBehaviour = behaviour;
              }),
            setMagicLinkBehaviour: (behaviour) =>
              Effect.sync(() => {
                magicLinkBehaviour = behaviour;
              }),
            clear: Effect.sync(() => {
              invitations.length = 0;
              magicLinks.length = 0;
            }),
          }),
        ),
      );
    }),
  );
