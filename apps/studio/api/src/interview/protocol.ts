import { Effect, Predicate } from 'effect';
import type { SqlError } from 'effect/sql';

import type { ProtocolPayload } from '@codaco/interview/contract';
import { currentProtocolToPayload } from '@codaco/interview/protocol-payload';
import {
  CurrentProtocolSchema,
  formatProtocolValidationIssues,
} from '@codaco/protocol-validation';

import { tenantTeamId, type Transaction } from '../db/tenant.ts';
import { openAssetKey } from '../protocol/asset-keys.ts';
import { getVersionDocument } from '../protocol/store.ts';
import { SecretsCipher } from '../secrets/services.ts';

export type PinnedVersion = {
  readonly protocolId: string;
  readonly protocolVersionId: string;
  readonly publishedAt: Date;
};

const withAssetKeys = Effect.fnUntraced(function* (
  document: Record<string, unknown>,
  scope: { readonly teamId: string; readonly protocolId: string },
) {
  const manifest = document['assetManifest'];
  if (!Predicate.isObject(manifest)) return document;
  const cipher = yield* SecretsCipher;
  const filled: Record<string, unknown> = {};
  for (const [assetId, entry] of Object.entries(manifest)) {
    if (!Predicate.isObject(entry) || entry['type'] !== 'apikey') {
      filled[assetId] = entry;
      continue;
    }
    const value = yield* openAssetKey(cipher, { ...scope, assetId });
    if (value === undefined) {
      return yield* Effect.die(
        new Error(
          `protocol ${scope.protocolId} has no key for API key asset ${assetId}`,
        ),
      );
    }
    filled[assetId] = { ...entry, value };
  }
  return { ...document, assetManifest: filled };
});

export const participantProtocolPayload: (
  version: PinnedVersion,
) => Effect.Effect<
  ProtocolPayload,
  SqlError.SqlError,
  Transaction | SecretsCipher
> = Effect.fn('interview.participantProtocolPayload')(function* (
  version: PinnedVersion,
) {
  const teamId = yield* tenantTeamId;
  const document = yield* getVersionDocument(
    teamId,
    version.protocolVersionId,
  ).pipe(Effect.catchTag('ProtocolStoreError', Effect.die));
  const withKeys = yield* withAssetKeys(document, {
    teamId,
    protocolId: version.protocolId,
  });
  const parsed = yield* Effect.promise(() =>
    CurrentProtocolSchema.safeParseAsync(withKeys),
  );
  if (!parsed.success) {
    return yield* Effect.die(
      new Error(
        `protocol version ${version.protocolVersionId} is not a valid schema 8 protocol:\n${formatProtocolValidationIssues(
          parsed.error.issues.map((issue) => ({
            code: issue.code,
            path: issue.path.map(String),
            message: issue.message,
          })),
        )}`,
      ),
    );
  }
  return currentProtocolToPayload(parsed.data, {
    id: version.protocolVersionId,
    importedAt: version.publishedAt.toISOString(),
  });
});
