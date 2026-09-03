// One protocol line per team, published twice, written through `ProtocolStore`
// — the sectioned store is the only correct writer of `protocols`,
// `protocol_versions` and `version_sections`, and reimplementing its
// sectionize/manifest/pin sequence in the seed is the dual-implementation trap
// ADR #1246 names three times.
//
// The store takes a `TenantDb` and routes writes through
// `runNoAuditTenantTransaction`, which opens a transaction of its own. The seed
// is one transaction by contract, so it hands the store an adapter that runs
// every unit of work on the seed's already-open client instead — see
// `seedTenantScope` for why that adapter must not open a subtransaction.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type pg from 'pg';

import type { CurrentProtocol, Stage } from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';
import type { TenantDb } from '@codaco/studio-sync/tenant';

import { addStage, removeStage } from '../../protocol/draft-structure.ts';
import { ProtocolStore } from '../../protocol/store.ts';
import { seedUuid } from './rng.ts';

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
};

export type SeededProtocolLine = {
  protocolId: string;
  draftId: string;
  name: string;
  /** Exactly two, oldest first. */
  versions: [SeededVersion, SeededVersion];
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

/**
 * A `TenantDb` that runs everything on the seed's single already-open client,
 * so `ProtocolStore`'s writes join the seed's one transaction instead of
 * opening their own.
 *
 * A unit of work is *not* wrapped in a savepoint, and that is the point.
 * `version_sections_insert_frozen` admits a pin only when its version row's
 * `xmin` equals `pg_current_xact_id()`, and `pg_current_xact_id()` is the
 * top-level transaction id: a row written inside a savepoint carries the
 * subtransaction's id instead, so publishing through a savepoint is refused
 * outright ("published protocol versions are immutable"). The same proof backs
 * `template_version_sections_insert_frozen` and
 * `session_snapshots_insert_frozen`, so no phase of the seed may sit in a
 * subtransaction. Nothing is lost: the seed has no recoverable failure — any
 * error rolls the whole transaction back and leaves the previous dataset in
 * place, which is the contract `seed.test.ts` pins.
 *
 * `opts.isolation` is ignored for the same reason: the enclosing transaction's
 * isolation level is already fixed, and the seed has no concurrent writer.
 *
 * The GUC the row-level security policies read is stamped by the caller for
 * the team currently being populated, so every statement here is already
 * inside that team's scope.
 */
function seedTenantScope(client: pg.PoolClient, teamId: string): TenantDb {
  const runOnSeedClient = async <T>(
    work: (seedClient: pg.PoolClient) => Promise<T>,
  ): Promise<T> => work(client);
  return {
    teamId,
    query: (text, values) => client.query(text, values),
    transaction: runOnSeedClient,
  };
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

async function readVersion(
  store: ProtocolStore,
  versionId: string,
  versionNumber: number,
  label: string,
): Promise<SeededVersion> {
  const { sectionHashes } = await store.getVersionSections(versionId);
  const document = (await store.getVersionDocument(
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
  };
}

/**
 * Creates the team's protocol from the bundled sample, publishes it, makes one
 * structural edit (a stage removed and re-added with a reworded prompt, the
 * `protocol-demo` sequence), and publishes again. The two versions are what
 * the team's waves pin.
 */
export async function seedProtocolLine(
  client: pg.PoolClient,
  teamId: string,
): Promise<SeededProtocolLine> {
  const scope = seedTenantScope(client, teamId);
  const store = new ProtocolStore(scope);
  const protocol = loadSampleProtocol();

  const protocolId = seedUuid();
  const draftId = seedUuid();
  await store.createProtocol({ protocol, protocolId, draftId });

  const firstVersionId = seedUuid();
  const first = await store.publishDraft({
    draftId,
    label: 'Baseline',
    versionId: firstVersionId,
  });
  if (first.status !== 'published') {
    throw new Error(`seed protocol v1 did not publish: ${first.status}`);
  }

  const created = await store.getDraftSections(draftId);
  const target = editableStage(created.sections);
  if (target === undefined) {
    throw new Error(
      'the seed protocol carries no stage with an editable prompt',
    );
  }
  const edited = structuredClone(target.doc);
  const prompts = edited.prompts as { text: string }[];
  prompts[0]!.text = `${prompts[0]!.text} (revised for wave 2)`;
  await removeStage(scope, { draftId, stageId: target.stageId });
  await addStage(scope, { draftId, stage: edited, index: target.index });

  const secondVersionId = seedUuid();
  const second = await store.publishDraft({
    draftId,
    label: 'Revised prompt wording',
    versionId: secondVersionId,
  });
  if (second.status !== 'published') {
    throw new Error(`seed protocol v2 did not publish: ${second.status}`);
  }

  return {
    protocolId,
    draftId,
    name: protocol.name,
    versions: [
      await readVersion(
        store,
        first.versionId,
        first.versionNumber,
        'Baseline',
      ),
      await readVersion(
        store,
        second.versionId,
        second.versionNumber,
        'Revised prompt wording',
      ),
    ],
  };
}
