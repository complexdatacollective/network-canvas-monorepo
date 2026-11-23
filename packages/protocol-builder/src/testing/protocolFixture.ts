import type { StageType } from '@codaco/protocol-validation';
import regionsLayer from '@codaco/protocols/e2e/all-interfaces/assets/regions.geojson?raw';
import rosterNetwork from '@codaco/protocols/e2e/all-interfaces/assets/roster.json?raw';
import allInterfaces from '@codaco/protocols/e2e/all-interfaces/protocol.json';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import {
  protocolLocalizationOf,
  type ProtocolLocalization,
} from '../localization/localizedText.ts';
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
 * The name a test opens each of the fixture's stages by, and the interface it
 * configures.
 *
 * A stage's own id is a UUID nobody can read, so a test names a stage by the
 * handle written here instead, and the harness finds the one stage of that
 * interface the fixture holds. The fixture holds exactly one stage of every
 * interface, and `loadFixtureStage` refuses a handle that does not find exactly
 * one.
 *
 * Written down rather than read out of the protocol, because the protocol is
 * JSON: a `type` read out of it is a `string` as far as the compiler is
 * concerned, and the harness could not tell an `Information` editor mounted
 * over `ego-form-1` from one mounted over `information-1`. Written down here,
 * "which interface is `ego-form-1`?" becomes a question the compiler can
 * answer. See `FixtureStageId`, and `RenderStageEditorOptions.stageId`, which
 * is typed from it.
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
  'language-chooser-1': 'LanguageChooser',
  'finish': 'FinishSession',
} as const satisfies Readonly<Record<string, StageType>>;

type FixtureStageTypes = typeof FIXTURE_STAGE_TYPES;

/**
 * The handles of the fixture stages that configure `T`.
 *
 * `FixtureStageId<StageType>` is every handle, which is what a call that has
 * not named an interface may pass. Narrow `T` (by naming the editor under
 * test, or by building the stage) and it narrows to the stages that interface
 * actually has.
 */
export type FixtureStageId<T extends StageType = StageType> = {
  [Id in keyof FixtureStageTypes]: FixtureStageTypes[Id] extends T ? Id : never;
}[keyof FixtureStageTypes];

const DECLARED_STAGE_TYPES: ReadonlyMap<string, StageType> = new Map(
  Object.entries(FIXTURE_STAGE_TYPES),
);

/** The stage's identity, and the document without it. */
export type FixtureStage = Readonly<{
  id: string;
  type: StageType;
  /** Everything but `id` and `type`, which the section owns. */
  fields: SectionDoc;
}>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function fixtureStages(): Record<string, unknown>[] {
  const stages = FIXTURE.stages;
  return Array.isArray(stages) ? stages.filter(isRecord) : [];
}

/**
 * Every stage id the fixture holds, in the order it holds them.
 *
 * Part of the harness's surface, for a test that asks something of all of them
 * at once rather than of one it names.
 */
export function fixtureStageIds(): string[] {
  return fixtureStages().flatMap((stage) =>
    typeof stage.id === 'string' ? [stage.id] : [],
  );
}

/**
 * One stage of the fixture, named by its handle in `FIXTURE_STAGE_TYPES`,
 * split into what the section owns and what the editor edits.
 *
 * A name that is not a handle is read as the stage's own id. Throws rather
 * than answering with a blank stage: a test naming a stage that is not there
 * would otherwise mount an empty editor and pass, proving nothing about the
 * interface it was written for.
 */
export function loadFixtureStage(handle: string): FixtureStage {
  const declared = DECLARED_STAGE_TYPES.get(handle);
  const matches = fixtureStages().filter((candidate) =>
    declared === undefined
      ? candidate.id === handle
      : candidate.type === declared,
  );
  const [stage] = matches;
  if (stage === undefined || matches.length > 1) {
    throw new Error(
      declared === undefined
        ? `The all-interfaces protocol has no stage "${handle}". It has: ${fixtureStageIds().join(', ')}.`
        : `The all-interfaces protocol holds ${matches.length} "${declared}" stages, and the handle "${handle}" needs exactly one.`,
    );
  }
  const { id, type, ...fields } = stage;
  if (typeof id !== 'string' || !isStageType(type)) {
    throw new Error(`Fixture stage "${handle}" has no id or known type.`);
  }
  return { id, type, fields };
}

/** The id the fixture holds the stage named by `handle` under. */
export const fixtureStageId = (handle: FixtureStageId): string =>
  loadFixtureStage(handle).id;

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

const fixtureCodebook = (): Record<string, unknown> =>
  isRecord(FIXTURE.codebook) ? FIXTURE.codebook : {};

const keyNamed = (record: unknown, name: string): string | undefined =>
  isRecord(record)
    ? Object.keys(record).find((key) => {
        const entry = record[key];
        return isRecord(entry) && entry.name === name;
      })
    : undefined;

/**
 * The id the fixture keeps its node or edge type called `name` under.
 *
 * Codebook ids are UUIDs nobody can read, so a test names a type by its name.
 * Throws for a name the fixture does not have, rather than handing a test an
 * id that names nothing.
 */
export function fixtureTypeId(entity: 'node' | 'edge', name: string): string {
  const key = keyNamed(fixtureCodebook()[entity], name);
  if (key === undefined) {
    throw new Error(
      `The all-interfaces protocol has no ${entity} type "${name}".`,
    );
  }
  return key;
}

/**
 * The id the fixture keeps the variable called `name` under, on the ego or
 * on the node or edge type called `typeName`.
 */
export function fixtureVariableId(
  owner: 'ego' | Readonly<{ entity: 'node' | 'edge'; typeName: string }>,
  name: string,
): string {
  const codebook = fixtureCodebook();
  const definition =
    owner === 'ego'
      ? codebook.ego
      : (() => {
          const types = codebook[owner.entity];
          return isRecord(types)
            ? types[fixtureTypeId(owner.entity, owner.typeName)]
            : undefined;
        })();
  const key = keyNamed(
    isRecord(definition) ? definition.variables : undefined,
    name,
  );
  if (key === undefined) {
    throw new Error(`The all-interfaces protocol has no variable "${name}".`);
  }
  return key;
}

/** The languages the fixture protocol declares. */
export function fixtureLocalization(): ProtocolLocalization {
  const localization = protocolLocalizationOf(
    fixtureProtocolSections()[sectionId({ kind: 'settings' })] ?? {},
  );
  if (localization === undefined) {
    throw new TypeError('The fixture protocol declares no valid languages.');
  }
  return localization;
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
 * The bytes a host holds for a manifest's assets, keyed by the filename the
 * manifest names, ready to seed a resource gateway with.
 *
 * An asset the fixture ships a file for is seeded with that file, because an
 * editor asks the host what is INSIDE a data file — a roster's columns are the
 * material its card, sort and search sections offer. Everything else gets a
 * placeholder body: those editors read only a resource's kind, name and size.
 *
 * Here rather than in either harness, because both of them seed the same
 * gateway from the same manifest: `renderStageEditor` for the suite, and
 * `StageEditorStoryHost` for the stories. A harness that seeded only the
 * manifest would leave `inspect` refusing for want of bytes, and every section
 * chosen from a data file's columns would render its empty state.
 *
 * `extra` is the text a test wants served for a `source` of its own — a layer
 * with no feature properties, a roster with a column the fixture's has not.
 * A file the protocol does not ship is the only way to reach the states an
 * editor has for one, and they are researcher-visible states.
 */
export function fixtureAssetContentFor(
  manifest: Readonly<Record<string, unknown>>,
  extra: Readonly<Record<string, string>> = {},
): Record<string, Blob> {
  const content: Record<string, Blob> = {};
  for (const entry of Object.values(manifest)) {
    if (!isRecord(entry)) continue;
    const source = entry.source;
    if (typeof source !== 'string') continue;
    content[source] = new Blob(
      [extra[source] ?? FIXTURE_ASSET_CONTENT[source] ?? '{}'],
      { type: 'application/json' },
    );
  }
  return content;
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
