import type { StageType } from '@codaco/protocol-validation';
import regionsLayer from '@codaco/protocols/e2e/all-interfaces/assets/regions.geojson?raw';
import rosterNetwork from '@codaco/protocols/e2e/all-interfaces/assets/roster.json?raw';
import allInterfaces from '@codaco/protocols/e2e/all-interfaces/protocol.json';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { isStageType } from '../stage-types.ts';

/**
 * The protocol every stage editor is tested against.
 *
 * One protocol with a configured stage of every interface, kept beside the
 * end-to-end suites that already drive it, so a package test and an Architect
 * run disagree about a stage's shape only when one of them is wrong. Editing
 * the fixture to make a test pass therefore changes what the app is tested
 * against too, which is the point.
 */
const FIXTURE: Record<string, unknown> = allInterfaces;

/**
 * Which interface each of the fixture's stages configures, written down.
 *
 * The protocol is JSON, so a `type` read out of it is a `string` as far as the
 * compiler is concerned, and the harness could not tell an `Information`
 * editor mounted over `ego-form-1` from one mounted over `information-1`: the
 * stage type reached the editor as a runtime string that the call's own type
 * parameter relabelled. Written down here, "which interface is
 * `ego-form-1`?" becomes a question the compiler can answer — see
 * `FixtureStageId`, and `RenderStageEditorOptions.stageId`, which is typed
 * from it.
 *
 * Hand-written, and therefore capable of lying: `assertDeclaredStageType`
 * refuses a stage whose protocol document says something else, so the lie is
 * caught the first time the stage is opened rather than becoming a false claim
 * the type system enforces. `protocolFixture.test.ts` asks the same question
 * of every stage at once.
 *
 * One entry per line, in the order the protocol holds them.
 */
const FIXTURE_STAGE_TYPES = {
  'anonymisation-1': 'Anonymisation',
  'ego-form-1': 'EgoForm',
  'information-1': 'Information',
  'name-generator-1': 'NameGenerator',
  'name-generator-quick-add-1': 'NameGeneratorQuickAdd',
  'name-generator-roster-1': 'NameGeneratorRoster',
  'sociogram-1': 'Sociogram',
  'dyad-census-1': 'DyadCensus',
  'one-to-many-dyad-census-1': 'OneToManyDyadCensus',
  'tie-strength-census-1': 'TieStrengthCensus',
  'ordinal-bin-1': 'OrdinalBin',
  'categorical-bin-1': 'CategoricalBin',
  'alter-form-1': 'AlterForm',
  'alter-edge-form-1': 'AlterEdgeForm',
  'narrative-1': 'Narrative',
  'family-pedigree-1': 'FamilyPedigree',
  'narrative-pedigree-1': 'NarrativePedigree',
  'network-composer-1': 'NetworkComposer',
  'geospatial-1': 'Geospatial',
} as const satisfies Readonly<Record<string, StageType>>;

type FixtureStageTypes = typeof FIXTURE_STAGE_TYPES;

/**
 * The fixture stages that configure `T`.
 *
 * `FixtureStageId<StageType>` is every id the fixture holds, which is what a
 * call that has not named an interface may pass. Narrow `T` — by naming the
 * editor under test, or by building the stage — and it narrows to the stages
 * that interface actually has.
 */
export type FixtureStageId<T extends StageType = StageType> = {
  [Id in keyof FixtureStageTypes]: FixtureStageTypes[Id] extends T ? Id : never;
}[keyof FixtureStageTypes];

/** The same map, for the runtime half, which is asked about arbitrary ids. */
const DECLARED_STAGE_TYPES: ReadonlyMap<string, StageType> = new Map(
  Object.entries(FIXTURE_STAGE_TYPES),
);

/**
 * The interface a fixture stage is written down as, refusing anything else.
 *
 * The runtime half of `FIXTURE_STAGE_TYPES`. What is written down decides how
 * a call naming this id is typed, so a map that has drifted from the protocol
 * is a claim the compiler enforces and nothing checks — an editor written for
 * one interface would be accepted over a stage that is now another, which is
 * the very thing the map exists to refuse. Both types are in the message,
 * because which of the two is wrong is not this function's to decide.
 */
export function assertDeclaredStageType(
  stageId: string,
  type: StageType,
): StageType {
  const declared = DECLARED_STAGE_TYPES.get(stageId);
  if (declared === undefined) {
    throw new Error(
      `The all-interfaces protocol has a stage "${stageId}" that \`FIXTURE_STAGE_TYPES\` does not name, so nothing says which interface it configures. Add it.`,
    );
  }
  if (declared !== type) {
    throw new Error(
      `\`FIXTURE_STAGE_TYPES\` says the all-interfaces stage "${stageId}" is a "${declared}", and the protocol says it is a "${type}". A call naming this stage is typed from the first, so an editor written for "${declared}" would be mounted over a "${type}".`,
    );
  }
  return declared;
}

/** The stage's identity, and the document without it. */
export type FixtureStage = Readonly<{
  id: string;
  type: StageType;
  /** Everything but `id` and `type`, which the session owns. */
  fields: SectionDoc;
}>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function fixtureStages(): Record<string, unknown>[] {
  const stages = FIXTURE.stages;
  return Array.isArray(stages) ? stages.filter(isRecord) : [];
}

/**
 * Every stage the fixture holds, in the order it holds them.
 *
 * Part of the harness's surface, for a test that asks something of all of them
 * at once rather than of one it names — which is how the interface each of
 * them configures is held level with `FIXTURE_STAGE_TYPES`.
 */
export function fixtureStageIds(): string[] {
  return fixtureStages().flatMap((stage) =>
    typeof stage.id === 'string' ? [stage.id] : [],
  );
}

/**
 * One stage of the fixture, split into what the session owns and what the
 * editor edits.
 *
 * Throws rather than answering with a blank stage: a test naming a stage that
 * is not there would otherwise mount an empty editor and pass, proving nothing
 * about the interface it was written for.
 */
export function loadFixtureStage(stageId: string): FixtureStage {
  const stage = fixtureStages().find((candidate) => candidate.id === stageId);
  if (stage === undefined) {
    throw new Error(
      `The all-interfaces protocol has no stage "${stageId}". It has: ${fixtureStageIds().join(', ')}.`,
    );
  }
  const { id: _id, type, ...fields } = stage;
  if (!isStageType(type)) {
    throw new Error(`Fixture stage "${stageId}" has no known interface type.`);
  }
  // Checked here rather than trusted, because this is where a stage is opened:
  // what `FIXTURE_STAGE_TYPES` says about this id is what typed the call that
  // asked for it.
  assertDeclaredStageType(stageId, type);
  return { id: stageId, type, fields };
}

/**
 * The fixture protocol as the client-safe section model holds it.
 *
 * A host stores a protocol as sections and a stage editor edits exactly one of
 * them, so a test that seeded a whole protocol document instead would be
 * testing a shape no host has.
 */
export function fixtureProtocolSections(): Record<string, SectionDoc> {
  const sections: Record<string, SectionDoc> = {};
  const { codebook, stages: _stages, assetManifest, ...settings } = FIXTURE;

  sections[sectionId({ kind: 'settings' })] = settings;
  sections[sectionId({ kind: 'stageOrder' })] = { stages: fixtureStageIds() };
  sections[sectionId({ kind: 'assets' })] = isRecord(assetManifest)
    ? assetManifest
    : {};

  for (const stage of fixtureStages()) {
    if (typeof stage.id !== 'string') continue;
    sections[sectionId({ kind: 'stage', stageId: stage.id })] = stage;
  }

  if (isRecord(codebook)) {
    for (const [typeId, definition] of Object.entries(
      isRecord(codebook.node) ? codebook.node : {},
    )) {
      if (isRecord(definition)) {
        sections[sectionId({ kind: 'codebookNode', typeId })] = definition;
      }
    }
    for (const [typeId, definition] of Object.entries(
      isRecord(codebook.edge) ? codebook.edge : {},
    )) {
      if (isRecord(definition)) {
        sections[sectionId({ kind: 'codebookEdge', typeId })] = definition;
      }
    }
    if (isRecord(codebook.ego)) {
      sections[sectionId({ kind: 'codebookEgo' })] = codebook.ego;
    }
  }

  return sections;
}

/** The fixture's asset manifest, for seeding a resource gateway from it. */
export function fixtureAssetManifest(): Record<string, unknown> {
  return isRecord(FIXTURE.assetManifest) ? FIXTURE.assetManifest : {};
}

/**
 * The bytes of an asset the fixture ships beside its protocol.
 *
 * A stage editor asks the gateway what is IN a data file — a roster's columns
 * are what the card, sort and search sections offer — so a gateway seeded with
 * a placeholder body would answer "this file is unreadable" and every one of
 * those sections would test its empty state instead of itself.
 *
 * `undefined` for an asset with no file beside the protocol, which the caller
 * seeds with a placeholder: the editors that reference those read only the
 * manifest's name and kind.
 */
export function fixtureAssetContent(source: string): Uint8Array | undefined {
  const content = FIXTURE_ASSET_CONTENT[source];
  return content === undefined ? undefined : new TextEncoder().encode(content);
}

/**
 * Every file the fixture ships beside its protocol, keyed by the `source` its
 * manifest names, and holding the file's own text.
 *
 * One entry per file in `packages/protocols/e2e/all-interfaces/assets`, which
 * is the rule rather than the current contents: a manifest entry naming a file
 * that is missing from here is seeded with `{}` instead, and every editor that
 * reads that file tests its "this cannot be read" state rather than itself —
 * which is exactly how the map layer went unread. `protocolFixture.test.ts`
 * holds the rule in place by asking the manifest, so a new asset added to the
 * protocol fails here until its bytes are seeded too.
 *
 * The text rather than a parsed value, because bytes are what a gateway hands
 * an editor: a file the editor parses itself must arrive the way the host
 * would deliver it, not the way a bundler happened to read it.
 */
const FIXTURE_ASSET_CONTENT: Readonly<Record<string, string>> = Object.freeze({
  'regions.geojson': regionsLayer,
  'roster.json': rosterNetwork,
});
