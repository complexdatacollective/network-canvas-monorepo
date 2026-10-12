import { describe, expect, it } from '@effect/vitest';
import { Console, Effect, Layer, Logger, Redacted } from 'effect';

import { UPGRADE_GUIDE_URL } from '@codaco/studio-contract/surfaces';

import {
  Mailer,
  type TeamInvitationInput,
  type UpdateNoticeInput,
} from '../mailer.ts';
import { updateNoticeMessage } from '../smtp.ts';

const MAGIC_LINK_EMAIL = 'researcher@example.org';
const MAGIC_LINK_URL =
  'https://studio.example.org/api/auth/magic-link/verify?token=abc';

const MAGIC_LINK = {
  email: Redacted.make(MAGIC_LINK_EMAIL),
  url: Redacted.make(MAGIC_LINK_URL),
};

const INVITATION: TeamInvitationInput = {
  email: Redacted.make('invitee@example.org'),
  expiresAt: new Date('2026-01-02T03:04:05.000Z'),
  invitationUrl: Redacted.make('https://studio.example.org/invitations/abc'),
  inviterLabel: Redacted.make('Ada Lovelace'),
  messageId: 'invitation-1@studio.example.org',
  role: 'member',
  teamLabel: Redacted.make('Fieldwork'),
};

const UPDATE_NOTICE: UpdateNoticeInput = {
  email: Redacted.make('owner@example.org'),
  name: Redacted.make('Ada Lovelace'),
  version: '1.2.3',
  notesUrl: 'https://releases.networkcanvas.com/studio/1.2.3/notes',
  schemaChange: false,
  deploymentMode: 'self-hosted',
};

function capturingConsole(lines: string[]): Layer.Layer<never> {
  return Layer.succeed(Console.Console, {
    ...globalThis.console,
    log: (...args: ReadonlyArray<unknown>) => {
      lines.push(args.map(String).join(' '));
    },
  });
}

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

describe('the mailer with no transport, for the update notice', () => {
  it.effect('refuses an update notice, naming what it could not send', () =>
    Effect.gen(function* () {
      const mailer = yield* Mailer;
      const failure = yield* Effect.flip(
        mailer.sendUpdateNotice(UPDATE_NOTICE),
      );

      expect(failure._tag).toBe('MailNotConfigured');
      expect(failure.message).toBe(
        'No SMTP transport is configured; cannot send update notice',
      );
    }).pipe(Effect.provide(Mailer.layerRefuse)),
  );
});

describe('the update notice', () => {
  it('names the version, links the release notes and says what rolling back means', () => {
    const plain = updateNoticeMessage(UPDATE_NOTICE);
    expect(plain.subject).toBe('Network Canvas Studio 1.2.3 is available');
    expect(plain.text).toContain('Hello Ada Lovelace,');
    expect(plain.text).toContain(UPDATE_NOTICE.notesUrl);
    expect(plain.text).toContain(
      'Upgrading to this release does not change the database.',
    );
    expect(plain.text).not.toContain('restoring the backup');

    const changing = updateNoticeMessage({
      ...UPDATE_NOTICE,
      schemaChange: true,
    });
    expect(changing.text).toContain(
      'Rolling back means restoring the backup taken during the upgrade.',
    );
    expect(changing.text).not.toContain('does not change the database');
  });

  it('points a self-hosted owner at the upgrade guide, by the address the in-app notice uses, and a managed one nowhere', () => {
    const selfHosted = updateNoticeMessage(UPDATE_NOTICE).text;
    expect(selfHosted).toContain('upgrade guide');
    expect(selfHosted).toContain(UPGRADE_GUIDE_URL);
    const managed = updateNoticeMessage({
      ...UPDATE_NOTICE,
      deploymentMode: 'managed',
    }).text;
    expect(managed).not.toContain('upgrade guide');
    expect(managed).not.toContain(UPGRADE_GUIDE_URL);
  });
});

describe('the console mailer', () => {
  it.effect('prints the sign-in link to stdout rather than sending it', () => {
    const lines: string[] = [];
    const logged: string[] = [];
    return Effect.gen(function* () {
      const mailer = yield* Mailer;
      yield* mailer.sendMagicLink(MAGIC_LINK);

      expect(lines).toEqual([
        `Magic link for ${MAGIC_LINK_EMAIL}: ${MAGIC_LINK_URL}`,
      ]);
      expect(logged).toEqual([]);
    }).pipe(
      Effect.provide(Mailer.layerConsole),
      Effect.provide(capturingConsole(lines)),
      Effect.provide(capturingLogger(logged)),
    );
  });

  it.effect(
    'prints the invitation link to stdout rather than sending it',
    () => {
      const lines: string[] = [];
      const logged: string[] = [];
      return Effect.gen(function* () {
        const mailer = yield* Mailer;
        yield* mailer.sendTeamInvitation(INVITATION);

        expect(lines).toEqual([
          `Invitation to ${Redacted.value(INVITATION.teamLabel)} for ${Redacted.value(INVITATION.email)}: ${Redacted.value(INVITATION.invitationUrl)}`,
        ]);
        expect(logged).toEqual([]);
      }).pipe(
        Effect.provide(Mailer.layerConsole),
        Effect.provide(capturingConsole(lines)),
        Effect.provide(capturingLogger(logged)),
      );
    },
  );
});

describe('the console mailer, for the update notice', () => {
  it.effect('prints the notice to stdout rather than sending it', () => {
    const lines: string[] = [];
    const logged: string[] = [];
    return Effect.gen(function* () {
      const mailer = yield* Mailer;
      yield* mailer.sendUpdateNotice(UPDATE_NOTICE);

      expect(lines).toEqual([
        `Studio 1.2.3 is available; notice for owner@example.org: ${UPDATE_NOTICE.notesUrl}`,
      ]);
      expect(logged).toEqual([]);
    }).pipe(
      Effect.provide(Mailer.layerConsole),
      Effect.provide(capturingConsole(lines)),
      Effect.provide(capturingLogger(logged)),
    );
  });
});
