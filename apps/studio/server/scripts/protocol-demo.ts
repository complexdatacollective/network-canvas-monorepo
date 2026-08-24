import { existsSync, readFileSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import { type SectionDoc, canonicalize } from '@codaco/studio-sync/apply';
import { createTenantDb } from '@codaco/studio-sync/tenant';

import { createPool } from '../src/db/pool.ts';
import { checkSchema, schemaProblemMessage } from '../src/db/schema.ts';
import { isLocalDatabase, readEnv } from '../src/env.ts';
import type { FieldChange, ProtocolChange } from '../src/protocol/diff.ts';
import { addStage, removeStage } from '../src/protocol/draft-structure.ts';
import { ProtocolStore } from '../src/protocol/store.ts';
import { parseSectionId, sectionId } from '../src/protocol/taxonomy.ts';
import { applySchema } from './apply.ts';

// Shows what a protocol looks like inside the store, because no RPC procedure
// or screen reaches it yet. Verification belongs to src/protocol's suites, not
// here.

const { values } = parseArgs({
  options: {
    protocol: { type: 'string' },
    sections: { type: 'boolean', default: false },
    force: { type: 'boolean', default: false },
  },
});

function loadEnvFiles(): void {
  const file = (name: string) =>
    fileURLToPath(new URL(`../${name}`, import.meta.url));
  if (existsSync(file('.env'))) process.loadEnvFile(file('.env'));
  const target = process.env.DATABASE_URL;
  if (
    (!target || isLocalDatabase(target)) &&
    existsSync(file('.env.development'))
  ) {
    process.loadEnvFile(file('.env.development'));
  }
}

const DEFAULT_PROTOCOL = '@codaco/protocols/sample';

function loadProtocol(): { protocol: CurrentProtocol; source: string } {
  const source = values.protocol ?? DEFAULT_PROTOCOL;
  const path = values.protocol
    ? values.protocol
    : fileURLToPath(import.meta.resolve(DEFAULT_PROTOCOL));
  return {
    protocol: JSON.parse(readFileSync(path, 'utf8')) as CurrentProtocol,
    source,
  };
}

const short = (value: string) => value.slice(0, 8);
const pad = (value: string, width: number) => value.padEnd(width);
const bytes = (doc: SectionDoc) => JSON.stringify(doc).length;

function step(n: number, title: string) {
  console.log(`\n${n}  ${title}\n${'─'.repeat(66)}`);
}

function stageOrderOf(doc: SectionDoc | undefined): string[] {
  const value = doc?.stages;
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function formatPath(path: FieldChange['path']): string {
  return path
    .map((part) => (typeof part === 'string' ? short(part) : String(part)))
    .join('.');
}

function formatFields(changes: FieldChange[]): string {
  return changes
    .map((change) => `${formatPath(change.path)} ${change.change}`)
    .join(', ');
}

function describeChange(
  change: ProtocolChange,
  stageLabels: Map<string, string>,
): string {
  const named = (stageId: string) =>
    `“${stageLabels.get(stageId) ?? short(stageId)}”`;

  switch (change.kind) {
    case 'stage-added':
      return `Stage ${named(change.stageId)} (${change.stageType}) added at position ${change.index + 1}`;
    case 'stage-removed':
      return `Stage ${named(change.stageId)} (${change.stageType}) removed`;
    case 'stage-moved':
      return `Stage ${named(change.stageId)} moved from position ${change.from + 1} to ${change.to + 1}`;
    case 'stage-changed':
      return `Stage ${named(change.stageId)} (${change.stageType}) changed: ${formatFields(change.changes)}`;
    case 'entity-added':
    case 'entity-removed':
      return `Codebook ${change.entity} “${change.name ?? change.typeId ?? change.entity}” ${change.kind === 'entity-added' ? 'added' : 'removed'}`;
    case 'entity-changed': {
      const variables = change.variables
        .map(
          (variable) =>
            `${variable.name} ${variable.change}${
              variable.changedKeys?.length
                ? ` (${variable.changedKeys.join(', ')})`
                : ''
            }`,
        )
        .join(', ');
      const parts = [
        change.changes.length > 0 ? formatFields(change.changes) : '',
        variables ? `variables: ${variables}` : '',
      ].filter(Boolean);
      return `Codebook ${change.entity} “${change.name ?? change.typeId ?? change.entity}” changed: ${parts.join('; ')}`;
    }
    case 'settings-changed':
      return `Protocol settings changed: ${formatFields(change.changes)}`;
    case 'assets-changed':
      return `Assets: ${change.added.length} added, ${change.removed.length} removed, ${change.changed.length} changed`;
  }
}

loadEnvFiles();

const env = readEnv();

if (!env.db) {
  console.error('DATABASE_URL is not set; there is no database to write to.');
  process.exit(1);
}

if (!isLocalDatabase(env.db.url) && !values.force) {
  console.error(
    'Refusing to write demo protocols to a non-local database. Pass --force to do it anyway.',
  );
  process.exit(1);
}

const url = new URL(env.db.url);
const pool = createPool(env.db);

try {
  const schema = await checkSchema(pool);
  if (schema.kind === 'stale') {
    console.error(schemaProblemMessage(schema));
    process.exit(1);
  }
  if (schema.kind === 'absent') {
    await applySchema(pool);
  }

  console.log(
    `Protocol store — ${url.hostname}:${url.port || '5432'}${url.pathname}`,
  );

  await pool.query(
    `INSERT INTO teams (id, name, slug) VALUES ('demo-team', 'Demo', 'demo-team')
     ON CONFLICT (id) DO NOTHING`,
  );
  const tenantDb = createTenantDb(pool, 'demo-team');
  const store = new ProtocolStore(tenantDb);

  // ── 1 ──────────────────────────────────────────────────────────────────
  step(1, 'The protocol document');
  const { protocol, source } = loadProtocol();
  const summary = [
    `“${protocol.name}”`,
    `schema ${protocol.schemaVersion}`,
    `${protocol.stages.length} stages`,
    `${Object.keys(protocol.codebook.node ?? {}).length} node types`,
    `${Object.keys(protocol.codebook.edge ?? {}).length} edge types`,
  ];
  if (protocol.codebook.ego) summary.push('ego');
  console.log(`  ${source}`);
  console.log(`  ${summary.join(' · ')}`);

  // ── 2 ──────────────────────────────────────────────────────────────────
  step(2, 'Sectionized into a draft');
  const { protocolId, draftId } = await store.createProtocol({ protocol });
  const created = await store.getDraftSections(draftId);
  const sectionIds = Object.keys(created.sections);
  console.log(`  protocol  ${protocolId}`);
  console.log(`  draft     ${draftId}`);
  console.log(
    `  ${sectionIds.length} sections · manifest seq ${created.headSeq} · hash ${short(created.headManifestHash)}`,
  );

  const byKind = new Map<string, { count: number; size: number }>();
  for (const [id, doc] of Object.entries(created.sections)) {
    const { kind } = parseSectionId(id);
    const entry = byKind.get(kind) ?? { count: 0, size: 0 };
    byKind.set(kind, { count: entry.count + 1, size: entry.size + bytes(doc) });
  }
  console.log(`\n  ${pad('kind', 16)}${pad('sections', 10)}bytes`);
  for (const [kind, entry] of byKind) {
    console.log(
      `  ${pad(kind, 16)}${pad(String(entry.count), 10)}${entry.size}`,
    );
  }

  if (values.sections) {
    console.log(`\n  ${pad('section id', 46)}${pad('hash', 10)}bytes`);
    for (const id of sectionIds) {
      const label = id.length > 44 ? `${id.slice(0, 43)}…` : id;
      console.log(
        `  ${pad(label, 46)}${pad(short(created.sectionHashes[id] ?? ''), 10)}${bytes(created.sections[id] ?? {})}`,
      );
    }
  } else {
    console.log('\n  (--sections lists every section and its hash)');
  }

  // ── 3 ──────────────────────────────────────────────────────────────────
  step(3, 'Assembled back — the contract every consumer sees');
  const assembled = await store.getDraftDocument(draftId);
  console.log(
    `  identical to the input document: ${
      canonicalize(assembled) === canonicalize(protocol) ? 'yes' : 'NO'
    }`,
  );

  // ── 4 ──────────────────────────────────────────────────────────────────
  step(4, 'Published');
  const first = await store.publishDraft({ draftId, label: 'demo v1' });
  if (first.status !== 'published') {
    console.error(`  expected a publish, got ${first.status}`);
    process.exit(1);
  }
  const v1 = await store.getVersionSections(first.versionId);
  console.log(
    `  version ${first.versionNumber} · hash ${short(first.versionHash)} · ${Object.keys(v1.sectionHashes).length} sections pinned`,
  );

  // ── 5 ──────────────────────────────────────────────────────────────────
  step(5, 'One prompt edited, then published again');
  const stages = stageOrderOf(
    created.sections[sectionId({ kind: 'stageOrder' })],
  )
    .map((stageId, index) => ({
      stageId,
      index,
      doc: created.sections[sectionId({ kind: 'stage', stageId })],
    }))
    .find(({ doc }) => {
      const prompts = doc?.prompts;
      return (
        Array.isArray(prompts) &&
        typeof (prompts[0] as { text?: unknown } | undefined)?.text === 'string'
      );
    });

  if (!stages?.doc) {
    console.error('  no stage in this protocol carries an editable prompt');
    process.exit(1);
  }

  const edited = structuredClone(stages.doc);
  const prompts = edited.prompts as { id?: unknown; text: string }[];
  const promptId =
    typeof prompts[0]?.id === 'string' ? prompts[0].id : '(unknown)';
  prompts[0]!.text = `${prompts[0]!.text} [edited by the store demo]`;

  // Live section edits belong to the sync engine's lease path, which has no
  // client here, so the edit is made structurally instead.
  await removeStage(tenantDb, { draftId, stageId: stages.stageId });
  const advanced = await addStage(tenantDb, {
    draftId,
    stage: edited,
    index: stages.index,
  });
  const head = await store.getDraftSections(draftId);
  const pinnedHashes = new Set(Object.values(v1.sectionHashes));
  const shared = Object.values(head.sectionHashes).filter((hash) =>
    pinnedHashes.has(hash),
  ).length;

  const second = await store.publishDraft({ draftId, label: 'demo v2' });
  if (second.status !== 'published') {
    console.error(`  expected a publish, got ${second.status}`);
    process.exit(1);
  }
  console.log(
    `  stage ${short(stages.stageId)} · prompt ${short(promptId)} · text changed`,
  );
  console.log(
    `  manifest seq ${created.headSeq} → ${advanced.manifestSeq} · hash ${short(advanced.manifestHash)}`,
  );
  console.log(
    `  ${shared} of ${Object.keys(head.sectionHashes).length} sections shared with version ${first.versionNumber} — unchanged sections are never copied`,
  );
  console.log(
    `  version ${second.versionNumber} · hash ${short(second.versionHash)}`,
  );

  // ── 6 ──────────────────────────────────────────────────────────────────
  step(6, 'Structural diff, in plaintext');
  const changes = await store.diffVersions(first.versionId, second.versionId);
  const labels = new Map<string, string>();
  for (const [id, doc] of Object.entries(
    (await store.getVersionSections(second.versionId)).sections,
  )) {
    const ref = parseSectionId(id);
    if (ref.kind === 'stage' && typeof doc.label === 'string') {
      labels.set(ref.stageId, doc.label);
    }
  }
  console.log(
    `  ${changes.length} change record(s) from comparing two manifests:\n`,
  );
  for (const change of changes) {
    console.log(`  • ${describeChange(change, labels)}`);
  }

  console.log(`
Inspect what was written:
  select version_number, label, version_hash
    from protocol_versions where protocol_id = '${protocolId}';

Published versions cannot be deleted, so db:reset is how you clear them.`);
} finally {
  await pool.end();
}
