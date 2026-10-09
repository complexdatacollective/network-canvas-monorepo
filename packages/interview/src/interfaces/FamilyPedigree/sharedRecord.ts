import {
  isFamilyPedigreeStageMetadata,
  type StageMetadata,
} from '@codaco/shared-consts';

/** What a stage tells about itself that decides whether it records the
 * same family as another. */
type StageSummary = {
  type: string;
  subject?: { entity?: string; type?: string } | null;
  edgeConfiguration?: { type: string };
};

/**
 * The steps of every Family Pedigree stage that records the same family as
 * the one at `step`, itself included: the same people (the subject's node
 * type) related by the same relationships (the edge type). A protocol may
 * have several, sharing their slots (schema 9), and they then draw and change
 * one family.
 */
export function stepsSharingFamily(
  stages: readonly StageSummary[],
  step: number,
): number[] {
  const own = stages[step];
  if (own?.type !== 'FamilyPedigree') return [step];
  return stages.flatMap((stage, index) =>
    stage.type === 'FamilyPedigree' &&
    stage.subject?.type === own.subject?.type &&
    stage.edgeConfiguration?.type === own.edgeConfiguration?.type
      ? [index]
      : [],
  );
}

/**
 * What the family's people are, beyond what the network records about them,
 * which belongs to the family rather than to the stage that found it out:
 * who holds a label saved as their name because they were left unnamed (by
 * the fingerprint of the value written), and who is an unnamed stand-in the
 * stage generated. Every stage that records the family (`stepsSharingFamily`)
 * keeps the same record, so a stand-in one gave is a stand-in to all, and a
 * label one saved is a label to all.
 */
export type SharedFamilyRecord = {
  generatedLabels: Record<string, string>;
  standIns: string[];
};

/**
 * The record every stage at `steps` keeps, together: everyone any of them
 * records. A stage writes the record to all of them (`sharedRecordWrites`),
 * so they differ only in a session saved before they shared it.
 */
export function readSharedFamilyRecord(
  stageMetadata: StageMetadata | null | undefined,
  steps: readonly number[],
): SharedFamilyRecord {
  const generatedLabels: Record<string, string> = {};
  const standIns = new Set<string>();
  for (const step of steps) {
    const entry = stageMetadata?.[step];
    if (!isFamilyPedigreeStageMetadata(entry)) continue;
    Object.assign(generatedLabels, entry.generatedLabels);
    for (const id of entry.standIns ?? []) standIns.add(id);
  }
  return { generatedLabels, standIns: [...standIns] };
}

const EMPTY: SharedFamilyRecord = { generatedLabels: {}, standIns: [] };

/**
 * The metadata to write at each of `steps` to record `patch` in the shared
 * record, keeping whatever else each stage records about itself (the framing
 * its participant chose). Only the steps whose record the patch changes are
 * written.
 */
export function sharedRecordWrites(
  stageMetadata: StageMetadata | null | undefined,
  steps: readonly number[],
  patch: Partial<SharedFamilyRecord>,
): { step: number; metadata: NonNullable<StageMetadata[string]> }[] {
  return steps.flatMap((step) => {
    const stored = stageMetadata?.[step];
    const own = isFamilyPedigreeStageMetadata(stored) ? stored : undefined;
    const metadata = { ...own, ...patch };
    // Nobody recorded, and no record, are the same.
    const unchanged = (Object.keys(patch) as (keyof SharedFamilyRecord)[])
      .filter((key) => patch[key] !== undefined)
      .every(
        (key) =>
          JSON.stringify(own?.[key] ?? EMPTY[key]) ===
          JSON.stringify(patch[key]),
      );
    return unchanged ? [] : [{ step, metadata }];
  });
}
