// What Studio can send, without a transport under it: the two refusals name
// what they could not send, the development loop puts the link in the log, and
// the Promise-shaped view the job handlers still take reports a failure as a
// rejection carrying the same message a job row would show.
import { describe, expect, it } from '@effect/vitest';
import { type Context, Effect, type Layer, Logger } from 'effect';

import {
  MailFailed,
  Mailer,
  MailNotConfigured,
  promiseMailer,
  type TeamInvitationInput,
} from '../mailer.ts';

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

describe('a failure on its way to a job row', () => {
  it('carries the reason, which is the whole of what an operator can read', () => {
    // pg-boss serialises a thrown error with `serialize-error`, which takes an
    // object's `toJSON` over walking it. The schema's own renders the declared
    // fields — a `Defect` cause encodes to `{}` and the message is a getter —
    // so without this the failed job would record no reason at all.
    expect(
      new MailFailed({ cause: new Error('Greeting never received') }).toJSON(),
    ).toEqual({ _tag: 'MailFailed', message: 'Greeting never received' });

    expect(new MailNotConfigured({ what: 'invitation' }).toJSON()).toEqual({
      _tag: 'MailNotConfigured',
      message: 'No SMTP transport is configured; cannot send invitation',
    });
  });
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

describe('the Promise-shaped view', () => {
  it.effect('rejects with the failure message a job row would carry', () =>
    Effect.gen(function* () {
      const services = yield* Effect.context();
      const sender = promiseMailer(
        Mailer.of({
          sendMagicLink: () =>
            Effect.fail(
              new MailFailed({ cause: new Error('Greeting never received') }),
            ),
          sendTeamInvitation: () => Effect.void,
        }),
        services,
      );

      // The handlers await this promise and put its message on the job, which
      // is the only place an operator can read why an attempt failed.
      yield* Effect.promise(() =>
        expect(sender.sendMagicLink(MAGIC_LINK)).rejects.toThrow(
          /Greeting never received/,
        ),
      );
    }),
  );

  it.effect('resolves a send that succeeded', () =>
    Effect.gen(function* () {
      const services = yield* Effect.context();
      const sent: string[] = [];
      const sender = promiseMailer(
        Mailer.of({
          sendMagicLink: ({ email }) =>
            Effect.sync(() => {
              sent.push(email);
            }),
          sendTeamInvitation: () => Effect.void,
        }),
        services,
      );

      yield* Effect.promise(() => sender.sendMagicLink(MAGIC_LINK));
      expect(sent).toEqual([MAGIC_LINK.email]);
    }),
  );

  it.effect('carries the calling program services into the send', () => {
    const lines: string[] = [];
    return Effect.gen(function* () {
      const services: Context.Context<never> = yield* Effect.context();
      const sender = promiseMailer(
        Mailer.of({
          sendMagicLink: ({ email }) => Effect.log(`sent to ${email}`),
          sendTeamInvitation: () => Effect.void,
        }),
        services,
      );

      yield* Effect.promise(() => sender.sendMagicLink(MAGIC_LINK));
      // The loggers the program was built with, not a bare runtime's: a line a
      // pg-boss callback writes has to reach the same place as everything else.
      expect(lines).toEqual([`sent to ${MAGIC_LINK.email}`]);
    }).pipe(Effect.provide(capturingLogger(lines)));
  });
});
