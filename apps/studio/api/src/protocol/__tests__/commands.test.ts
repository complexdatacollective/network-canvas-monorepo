import { randomUUID } from 'node:crypto';

import { assert } from '@effect/vitest';
import { Cause, Effect, Exit, Layer, Redacted, Schema } from 'effect';
import { describe, it } from 'vitest';

import { AuditActor } from '@codaco/studio-contract/middleware/audit-actor';
import { Principal } from '@codaco/studio-contract/middleware/authenticated';
import { UserId } from '@codaco/studio-contract/schema/ids';
import { sectionShapeIssues } from '@codaco/studio-sync/section-validation';

import { testCipher } from '../../__tests__/support/secrets.ts';
import { userAuditActor } from '../../audit/actor.ts';
import { AuditSignal } from '../../audit/signal.ts';
import { DatabaseAbsent } from '../../db/client.ts';
import { unsafeMakeTeamAccess } from '../../db/tenant.ts';
import { RequestId } from '../../http/middleware/request-id.ts';
import { Jobs } from '../../jobs/jobs.ts';
import { Analytics } from '../../platform/analytics.ts';
import { SecretsCipher } from '../../secrets/services.ts';
import {
  createAuditedProtocol,
  untitledScreenContent,
  untitledScreenText,
} from '../commands.ts';

const PRINCIPAL = Principal.of({
  kind: 'user',
  userId: Schema.decodeSync(UserId)('protocol-command-owner'),
  email: Redacted.make('protocol-command-owner@example.com'),
  emailVerified: true,
  name: Redacted.make('Protocol Command Owner'),
  locale: null,
  sessionId: 'protocol-command-owner-session',
});

const Harness = Layer.mergeAll(
  DatabaseAbsent,
  AuditSignal.layer,
  Analytics.layerDisabled,
  Jobs.layerRecording,
  Layer.succeed(SecretsCipher)(testCipher()),
  Layer.succeed(Principal, PRINCIPAL),
  Layer.succeed(AuditActor, userAuditActor(PRINCIPAL)),
  Layer.succeed(RequestId, RequestId.of(randomUUID())),
);

describe('audited protocol commands', () => {
  it('rejects a whitespace-only protocol name before opening a transaction', async () => {
    const outcome = await Effect.runPromise(
      Effect.exit(
        createAuditedProtocol(
          unsafeMakeTeamAccess('protocol-command-team', 'owner'),
          {
            name: Redacted.make('   '),
            protocolId: randomUUID(),
            draftId: randomUUID(),
          },
        ).pipe(Effect.provide(Harness)),
      ),
    );

    assert.isTrue(Exit.isFailure(outcome));
    assert.include(
      Exit.isFailure(outcome) ? Cause.pretty(outcome.cause) : '',
      'Protocol name must contain a non-whitespace character',
    );
  });
});

describe('the placeholder a new screen is named with', () => {
  it('is text in the default language only, leaving the others missing', () => {
    assert.deepStrictEqual(
      untitledScreenText({ defaultLocale: 'en', locales: ['fr', 'en', 'es'] }),
      { en: 'Untitled screen' },
    );
  });
});

describe('the page a new screen starts with', () => {
  it('is a heading in the default language only, leaving the others missing', () => {
    assert.deepStrictEqual(
      untitledScreenContent({
        defaultLocale: 'en',
        locales: ['fr', 'en', 'es'],
      }),
      { en: '# Untitled screen' },
    );
    assert.deepStrictEqual(
      untitledScreenContent({ defaultLocale: 'fr', locales: ['fr', 'en'] }),
      { fr: '# Untitled screen' },
    );
  });

  it('makes an Information stage that validates, with content and no title or items', () => {
    const localization = { defaultLocale: 'en', locales: ['en', 'fr'] };
    const stage = {
      id: randomUUID(),
      type: 'Information',
      label: untitledScreenText(localization),
      content: untitledScreenContent(localization),
    };

    assert.deepStrictEqual(sectionShapeIssues(`stage:${stage.id}`, stage), []);
    assert.deepStrictEqual(stage.label, { en: 'Untitled screen' });
    assert.deepStrictEqual(stage.content, { en: '# Untitled screen' });
    assert.isFalse('title' in stage);
    assert.isFalse('items' in stage);
  });
});
