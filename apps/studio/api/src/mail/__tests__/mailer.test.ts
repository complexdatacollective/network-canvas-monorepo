import { describe, expect, it } from '@effect/vitest';
import { Effect, type Layer, Logger } from 'effect';

import {
  Mailer,
  type TeamInvitationInput,
  type UpdateNoticeInput,
} from '../mailer.ts';
import { updateNoticeMessage } from '../smtp.ts';

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

const UPDATE_NOTICE: UpdateNoticeInput = {
  email: 'owner@example.org',
  name: 'Ada Lovelace',
  version: '1.2.3',
  notesUrl: 'https://releases.networkcanvas.com/studio/1.2.3/notes',
  schemaChange: false,
  deploymentMode: 'self-hosted',
};

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
    expect(plain.text).toContain('This release does not change the database.');
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

  it('points a self-hosted owner at the upgrade guide and a managed one nowhere', () => {
    expect(updateNoticeMessage(UPDATE_NOTICE).text).toContain('upgrade guide');
    expect(
      updateNoticeMessage({ ...UPDATE_NOTICE, deploymentMode: 'managed' }).text,
    ).not.toContain('upgrade guide');
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

describe('the console mailer, for the update notice', () => {
  it.effect('logs the notice rather than sending it', () => {
    const lines: string[] = [];
    return Effect.gen(function* () {
      const mailer = yield* Mailer;
      yield* mailer.sendUpdateNotice(UPDATE_NOTICE);

      expect(lines).toEqual([
        `Studio 1.2.3 is available; notice for owner@example.org: ${UPDATE_NOTICE.notesUrl}`,
      ]);
    }).pipe(
      Effect.provide(Mailer.layerConsole),
      Effect.provide(capturingLogger(lines)),
    );
  });
});
