// What Studio can send, without a transport under it: the two refusals name
// what they could not send, and the development loop puts the link in the log
// rather than sending it.
import { describe, expect, it } from '@effect/vitest';
import { Effect, type Layer, Logger } from 'effect';

import { Mailer, type TeamInvitationInput } from '../mailer.ts';

const MAGIC_LINK = {
  email: 'researcher@example.org',
  url: 'https://studio.example.org/api/auth/magic-link/verify?token=abc',
};

const INVITATION: TeamInvitationInput = {
  email: 'invitee@example.org',
  expiresAt: new Date('2026-01-02T03:04:05.000Z'),
  invitationUrl: 'https://studio.example.org/invitations/abc',
  inviterLabel: 'Ada Lovelace',
  messageId: 'invitation-1@studio.example.org',
  role: 'member',
  teamLabel: 'Fieldwork',
};

/** Every line a program logged, as the message alone. */
function capturingLogger(lines: string[]): Layer.Layer<never> {
  return Logger.layer([
    Logger.make(({ message }: Logger.Options<unknown>) => {
      lines.push(
        (Array.isArray(message) ? message : [message]).map(String).join(' '),
      );
    }),
  ]);
}

describe('the mailer with no transport', () => {
  it.effect('refuses a sign-in email, naming what it could not send', () =>
    Effect.gen(function* () {
      const mailer = yield* Mailer;
      const failure = yield* Effect.flip(mailer.sendMagicLink(MAGIC_LINK));

      expect(failure._tag).toBe('MailNotConfigured');
      expect(failure.message).toBe(
        'No SMTP transport is configured; cannot send sign-in email',
      );
    }).pipe(Effect.provide(Mailer.layerRefuse)),
  );

  it.effect('refuses an invitation, naming what it could not send', () =>
    Effect.gen(function* () {
      const mailer = yield* Mailer;
      const failure = yield* Effect.flip(mailer.sendTeamInvitation(INVITATION));

      expect(failure._tag).toBe('MailNotConfigured');
      expect(failure.message).toBe(
        'No SMTP transport is configured; cannot send invitation',
      );
    }).pipe(Effect.provide(Mailer.layerRefuse)),
  );
});

describe('the console mailer', () => {
  it.effect('logs the sign-in link rather than sending it', () => {
    const lines: string[] = [];
    return Effect.gen(function* () {
      const mailer = yield* Mailer;
      yield* mailer.sendMagicLink(MAGIC_LINK);

      expect(lines).toEqual([
        `Magic link for ${MAGIC_LINK.email}: ${MAGIC_LINK.url}`,
      ]);
    }).pipe(
      Effect.provide(Mailer.layerConsole),
      Effect.provide(capturingLogger(lines)),
    );
  });

  it.effect('logs the invitation link rather than sending it', () => {
    const lines: string[] = [];
    return Effect.gen(function* () {
      const mailer = yield* Mailer;
      yield* mailer.sendTeamInvitation(INVITATION);

      expect(lines).toEqual([
        `Invitation to ${INVITATION.teamLabel} for ${INVITATION.email}: ${INVITATION.invitationUrl}`,
      ]);
    }).pipe(
      Effect.provide(Mailer.layerConsole),
      Effect.provide(capturingLogger(lines)),
    );
  });
});
