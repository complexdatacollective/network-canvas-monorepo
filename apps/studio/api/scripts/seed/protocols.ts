// One protocol line per team, published twice, written through the protocol
// store — the sectioned store is the only correct writer of `protocols`,
// `protocol_versions` and `version_sections`, and reimplementing its
// sectionize/manifest/pin sequence in the seed is the dual-implementation trap
// ADR #1246 names three times.
//
// Every store function runs on the caller's `Transaction` and opens no scope of
// its own, so these writes join the seed's one transaction as they are. That
// is a requirement rather than a convenience: `version_sections_insert_frozen`
// admits a pin only when its version row's `xmin` equals
// `pg_current_xact_id()`, which is the top-level transaction id. A row written
// inside a savepoint carries the subtransaction's id instead, so publishing
// through one is refused outright ("published protocol versions are
// immutable"). The same proof backs `template_version_sections_insert_frozen`
// and `session_snapshots_insert_frozen`, so no phase of the seed may sit in a
// subtransaction. Nothing is lost: the seed has no recoverable failure — any
// error rolls the whole transaction back and leaves the previous dataset in
// place, which is the contract `seed.test.ts` pins.
//
// The GUC the row-level security policies read is stamped by the caller for
// the team currently being populated, so every statement here is already
// inside that team's scope.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Effect } from 'effect';

import type { CurrentProtocol, Stage } from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { addStage, removeStage } from '../../src/protocol/draft-structure.ts';
import {
  createProtocol,
  getDraftSections,
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
  sampleProtocol ??= JSON.parse(
    readFileSync(
      fileURLToPath(import.meta.resolve('@codaco/protocols/sample')),
      'utf8',
    ),
  ) as CurrentProtocol;
  return structuredClone(sampleProtocol);
}

function stageOrderOf(doc: SectionDoc | undefined): string[] {
  const value = doc?.stages;
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

/** The first stage carrying an editable prompt, which v2's edit rewords. */
function editableStage(
  sections: Record<string, SectionDoc>,
): { stageId: string; index: number; doc: SectionDoc } | undefined {
  const order = stageOrderOf(sections[sectionId({ kind: 'stageOrder' })]);
  for (const [index, stageId] of order.entries()) {
    const doc = sections[sectionId({ kind: 'stage', stageId })];
    const prompts = doc?.prompts;
    if (
      doc !== undefined &&
      Array.isArray(prompts) &&
      typeof (prompts[0] as { text?: unknown } | undefined)?.text === 'string'
    ) {
      return { stageId, index, doc };
    }
  }
  return undefined;
}

const readVersion = Effect.fnUntraced(function* (
  teamId: string,
  versionId: string,
  versionNumber: number,
  label: string,
  publishedAt: Date,
) {
  const { sectionHashes } = yield* getVersionSections(teamId, versionId);
  const document = (yield* getVersionDocument(
    teamId,
    versionId,
  )) as unknown as CurrentProtocol;
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

  const created = yield* getDraftSections(teamId, draftId);
  const target = editableStage(created.sections);
  if (target === undefined) {
    return yield* Effect.die(
      new Error('the seed protocol carries no stage with an editable prompt'),
    );
  }
  const edited = structuredClone(target.doc);
  const prompts = edited.prompts as { text: string }[];
  prompts[0]!.text = `${prompts[0]!.text} (revised for wave 2)`;
  // The edit that version 2 was published from, dated the day before it —
  // both halves, since each writes a stage-order section of its own.
  yield* removeStage(teamId, {
    draftId,
    stageId: target.stageId,
    createdAt: seedTime(-341),
  });
  yield* addStage(teamId, {
    draftId,
    stage: edited,
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
