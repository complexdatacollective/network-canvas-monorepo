// The sectioned store is the only correct writer of `protocols`,
// `protocol_versions` and `version_sections`, and reimplementing its
// sectionize/manifest/pin sequence in the seed is the dual-implementation trap
// ADR #1246 names three times.
//
// No phase of the seed may sit in a savepoint: `version_sections_insert_frozen`
// admits a pin only when its version row's `xmin` is the top-level transaction id.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Effect, Redacted } from 'effect';

import {
  type CurrentProtocol,
  CurrentProtocolSchema,
  type Stage,
  escapeMessageText,
  messageText,
} from '@codaco/protocol-validation';

import { insertStaged } from '../../src/protocol-builder/staging-store.ts';
import { withPlaceholderAssetKeys } from '../../src/protocol/asset-keys.ts';
import { addStage, removeStage } from '../../src/protocol/draft-structure.ts';
import {
  createProtocol,
  getVersionDocument,
  getVersionSections,
  publishDraft,
} from '../../src/protocol/store.ts';
import type { SecretsCipherApi } from '../../src/secrets/cipher.ts';
import { seedHex, seedTime, seedUuid } from './rng.ts';

/** The structural half of an assembled protocol document `generateNetwork` reads. */
export type SeededVersion = {
  versionId: string;
  versionNumber: number;
  label: string;
  codebook: CurrentProtocol['codebook'];
  stages: Stage[];
  schemaVersion: number;
  /** section id -> section hash, for the asset and template pin sets. */
  sectionHashes: Record<string, string>;
  /** When the version was frozen: nothing pinned to it is dated after this. */
  publishedAt: Date;
};

export type SeededProtocolLine = {
  protocolId: string;
  draftId: string;
  name: string;
  /** Exactly two, oldest first. */
  versions: [SeededVersion, SeededVersion];
  /**
   * The plaintext of the API-key asset added below. Returned for the same
   * reason the webhook secrets are: the dump-and-search test has to know what
   * to look for, and nothing else reads it.
   */
  plaintextAssetKey: string;
};

let sampleProtocol: CurrentProtocol | undefined;

/** The bundled sample protocol, read once and cloned per team. */
function loadSampleProtocol(): CurrentProtocol {
  sampleProtocol ??= CurrentProtocolSchema.parse(
    JSON.parse(
      readFileSync(
        fileURLToPath(import.meta.resolve('@codaco/protocols/sample')),
        'utf8',
      ),
    ),
  );
  return structuredClone(sampleProtocol);
}

/** A copy of the first stage carrying a prompt, with the prompt v2's edit rewords. */
function revisedStage(
  stages: readonly Stage[],
): { stage: Stage; index: number } | undefined {
  const index = stages.findIndex(
    (stage) => 'prompts' in stage && stage.prompts.length > 0,
  );
  const stage = structuredClone(stages[index]);
  const prompt =
    stage !== undefined && 'prompts' in stage ? stage.prompts[0] : undefined;
  if (stage === undefined || prompt === undefined) return undefined;
  prompt.text = Object.fromEntries(
    Object.entries(prompt.text).map(([locale, message]) => [
      locale,
      escapeMessageText(`${messageText(message)} (revised for wave 2)`),
    ]),
  );
  return { stage, index };
}

const readVersion = Effect.fnUntraced(function* (
  teamId: string,
  versionId: string,
  versionNumber: number,
  label: string,
  publishedAt: Date,
) {
  const { sectionHashes } = yield* getVersionSections(teamId, versionId);
  // The stored document carries no API-key values, which the schema requires.
  const document = CurrentProtocolSchema.parse(
    withPlaceholderAssetKeys(yield* getVersionDocument(teamId, versionId)),
  );
  return {
    versionId,
    versionNumber,
    label,
    codebook: document.codebook,
    stages: document.stages,
    schemaVersion: document.schemaVersion,
    sectionHashes,
    publishedAt,
  } satisfies SeededVersion;
});

/**
 * Creates the team's protocol from the bundled sample, publishes it, makes one
 * structural edit (a stage removed and re-added with a reworded prompt, the
 * `protocol-demo` sequence), and publishes again. The two versions are what
 * the team's waves pin.
 */
export const seedProtocolLine = Effect.fnUntraced(function* (
  teamId: string,
  /** Seals the protocol's API-key asset (#1900). */
  cipher: SecretsCipherApi,
) {
  const protocol = loadSampleProtocol();

  // The sample protocol carries images and rosters but no API key, and an
  // instance with no `protocol_asset_keys` row would leave the third secret
  // store untested by everything that reads a seeded database — the
  // dump-and-search test most of all. Added to the manifest rather than
  // written to the table directly, so `createProtocol` seals it through the
  // real write boundary and the stored document is redacted by the same code
  // a researcher's own key goes through.
  const assetKeyId = seedUuid();
  const plaintextAssetKey = `sk.seed-${seedHex(16)}`;
  protocol.assetManifest = {
    ...protocol.assetManifest,
    [assetKeyId]: {
      id: assetKeyId,
      name: 'Map token',
      type: 'apikey',
      value: plaintextAssetKey,
    },
  };

  // Dated so the line and both versions exist before any study is created
  // (about 320 days before the anchor) and long before the sessions that pin
  // them run; after the team itself, which dates from 400 days before.
  const protocolId = seedUuid();
  const draftId = seedUuid();
  yield* createProtocol(teamId, cipher, {
    protocol,
    protocolId,
    draftId,
    createdAt: seedTime(-380),
  });

  const firstVersionId = seedUuid();
  const firstPublishedAt = seedTime(-370);
  const first = yield* publishDraft(teamId, {
    draftId,
    label: 'Baseline',
    versionId: firstVersionId,
    publishedAt: firstPublishedAt,
  });
  if (first.status !== 'published') {
    return yield* Effect.die(
      new Error(`seed protocol v1 did not publish: ${first.status}`),
    );
  }

  const target = revisedStage(protocol.stages);
  if (target === undefined) {
    return yield* Effect.die(
      new Error('the seed protocol carries no stage with an editable prompt'),
    );
  }
  // The edit that version 2 was published from, dated the day before it —
  // both halves, since each writes a stage-order section of its own.
  yield* removeStage(teamId, {
    draftId,
    stageId: target.stage.id,
    createdAt: seedTime(-341),
  });
  yield* addStage(teamId, {
    draftId,
    stage: target.stage,
    index: target.index,
    createdAt: seedTime(-341),
  });

  const secondVersionId = seedUuid();
  const secondPublishedAt = seedTime(-340);
  const second = yield* publishDraft(teamId, {
    draftId,
    label: 'Revised prompt wording',
    versionId: secondVersionId,
    publishedAt: secondPublishedAt,
  });
  if (second.status !== 'published') {
    return yield* Effect.die(
      new Error(`seed protocol v2 did not publish: ${second.status}`),
    );
  }

  const line: SeededProtocolLine = {
    protocolId,
    draftId,
    name: protocol.name,
    plaintextAssetKey,
    versions: [
      yield* readVersion(
        teamId,
        first.versionId,
        first.versionNumber,
        'Baseline',
        firstPublishedAt,
      ),
      yield* readVersion(
        teamId,
        second.versionId,
        second.versionNumber,
        'Revised prompt wording',
        secondPublishedAt,
      ),
    ],
  };
  return line;
});

/**
 * Stages one API key in the team's draft, as an editing tab would before
 * submitting it, so the staged-secret store has a row in a seeded database
 * for the dump-and-search test to search. Written through the production
 * insert, which is what seals it. Returns the plaintext.
 */
export const seedStagedSecret = Effect.fnUntraced(function* (
  teamId: string,
  draftId: string,
  adminUserId: string,
  cipher: SecretsCipherApi,
) {
  const value = `sk.staged-${seedHex(16)}`;
  const requestId = seedUuid();
  yield* insertStaged(
    cipher,
    {
      teamId,
      draftId,
      owner: `${adminUserId}:${seedUuid()}`,
      editId: seedUuid(),
    },
    requestId,
    {
      kind: 'secret',
      descriptor: {
        id: seedUuid(),
        kind: 'apikey',
        name: Redacted.make('Staged map token'),
        status: 'staged',
      },
      value: Redacted.make(value),
    },
  );
  return value;
});
