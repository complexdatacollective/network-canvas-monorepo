import { Context, Effect, Layer } from 'effect';

import {
  type MagicLinkInput,
  type MailFailed,
  Mailer,
  type MailNotConfigured,
  type TeamInvitationInput,
} from '../../../mail/mailer.ts';

// What the handler suites need beyond `__tests__/support.ts` (which owns the
// scratch schema, the three identities and the worker layer): a transport.
//
// The spike carried a `Mailer` of its own inside the handler module; the
// handlers now take stage 1's (src/mail/mailer.ts), so the recording transport
// moves here — a test double belongs beside the tests rather than beside the
// production service. Both sends are recorded by one layer because a case
// about one of them is usually also asserting that the other stayed untouched.

export type MailBehaviour<Input> = (
  input: Input,
  /** 1 on the first send of this kind, so a case can answer differently. */
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
  /** Forgets what was sent, so a later assertion counts this case's sends. */
  readonly clear: Effect.Effect<void>;
};

export class RecordedMail extends Context.Service<
  RecordedMail,
  RecordedMailShape
>()('@studio/jobs/test/RecordedMail') {}

/**
 * A transport that records and answers however a case tells it to. The
 * behaviour is settable rather than fixed at construction so a case can make
 * one send hang while the next succeeds, which is what the duplicate-send
 * cases need.
 */
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
            // Suspended so the record is written when the send runs rather
            // than when the effect is built, which is what makes a case's
            // "one send has started" wait mean anything.
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
