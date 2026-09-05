import type { StageType } from '@codaco/protocol-validation';
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
