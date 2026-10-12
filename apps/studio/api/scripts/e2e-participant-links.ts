import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import process from 'node:process';

import { Effect, Redacted } from 'effect';

import { CurrentProtocolSchema } from '@codaco/protocol-validation';
import { TEAM_GUC } from '@codaco/studio-sync/rls';

import { OwnerDatabase } from '../src/db/client.ts';
import { OwnerScope, Transaction } from '../src/db/tenant.ts';
import { mintSessionToken } from '../src/interview/token.ts';
import { createProtocol, publishDraft } from '../src/protocol/store.ts';
import { createSecretsCipher } from '../src/secrets/cipher.ts';
import { parseKeyring } from '../src/secrets/keyring.ts';
import { insertRows } from './seed/insert.ts';

const required = (name: string): string => {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`${name} is required`);
  }
  return value;
};

const LEAN_PROTOCOL = new URL(
  '../../../../packages/protocols/e2e/interviewer-e2e/protocol.json',
  import.meta.url,
);

const liveStudy = Effect.fnUntraced(function* (
  teamId: string,
  protocolId: string,
  versionId: string,
  mode: 'managed' | 'anonymous',
) {
  const studyId = randomUUID();
  const waveId = randomUUID();
  const participantId = mode === 'managed' ? randomUUID() : null;
  const link = mintSessionToken(teamId);
  const now = new Date();

  yield* insertRows(
    'studies',
    [
      'id',
      'team_id',
      'name',
      'protocol_id',
      'participation_mode',
      'state',
      'went_live_at',
    ],
    [[studyId, teamId, `E2E ${mode} study`, protocolId, mode, 'live', now]],
  );
  yield* insertRows(
    'study_waves',
    ['id', 'study_id', 'team_id', 'wave_number', 'protocol_version_id'],
    [[waveId, studyId, teamId, 1, versionId]],
  );
  if (participantId !== null) {
    yield* insertRows(
      'participants',
      ['id', 'study_id', 'team_id', 'participant_code'],
      [[participantId, studyId, teamId, 'E2E-0001']],
    );
  }
  yield* insertRows(
    'interview_links',
    [
      'id',
      'study_id',
      'team_id',
      'wave_id',
      'participant_id',
      'kind',
      'token_hash',
    ],
    [
      [
        randomUUID(),
        studyId,
        teamId,
        waveId,
        participantId,
        participantId === null ? 'anonymous' : 'participant',
        link.secretHash,
      ],
    ],
  );
  return Redacted.value(link.token);
});

const program = Effect.fnUntraced(function* () {
  const protocol = CurrentProtocolSchema.parse(
    JSON.parse(readFileSync(LEAN_PROTOCOL, 'utf8')),
  );
  const cipher = createSecretsCipher(
    parseKeyring(readFileSync(required('STUDIO_SECRETS_KEY_FILE'), 'utf8')),
  );
  const teamId = randomUUID();

  return yield* OwnerScope.open(
    Effect.gen(function* () {
      const { sql } = yield* Transaction;
      yield* insertRows(
        'teams',
        ['id', 'name', 'slug'],
        [[teamId, 'E2E participants', `e2e-${teamId.slice(0, 8)}`]],
      );
      yield* sql`select set_config(${TEAM_GUC}, ${teamId}, true)`;

      const created = yield* createProtocol(teamId, cipher, { protocol });
      const published = yield* publishDraft(teamId, {
        draftId: created.draftId,
        label: 'E2E',
      });
      if (published.status !== 'published') {
        return yield* Effect.die(
          new Error(`the lean protocol did not publish: ${published.status}`),
        );
      }

      return {
        managed: yield* liveStudy(
          teamId,
          created.protocolId,
          published.versionId,
          'managed',
        ),
        anonymous: yield* liveStudy(
          teamId,
          created.protocolId,
          published.versionId,
          'anonymous',
        ),
      };
    }),
  );
});

const links = await Effect.runPromise(
  program().pipe(
    Effect.provide(
      OwnerDatabase.layer({
        url: required('DATABASE_URL'),
        passwordFile: process.env['DATABASE_PASSWORD_FILE'],
      }),
    ),
  ),
);

// oxlint-disable-next-line no-console -- the links are this script's output
console.log(JSON.stringify(links));
