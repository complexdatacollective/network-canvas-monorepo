import {
  isFamilyPedigreeStageMetadata,
  type StageMetadata,
} from '@codaco/shared-consts';

/** What a stage tells about itself that decides whether it records the
 * same family as another. */
type StageSummary = {
  type: string;
  subject?: { entity?: string; type?: string } | null;
  nodeConfiguration?: {
    nameAttribute?: string;
    sexAssignedAtBirthAttribute?: string;
    egoAttribute?: string;
  };
  edgeConfiguration?: {
    type?: string;
    kindAttribute?: string;
    gestationalCarrierAttribute?: string;
    currentPartnerAttribute?: string;
  };
};

/** What defines the family a stage records: its people (the subject's node
 * type) and their relationships (the edge type), and the attributes through
 * which it marks the participant, records each relationship's kind, who
 * carried a pregnancy, whether a partnership is current, and the sex at birth
 * that decides who could have given which gamete. */
const familyOf = (stage: StageSummary) =>
  JSON.stringify([
    stage.subject?.type,
    stage.edgeConfiguration?.type,
    stage.nodeConfiguration?.egoAttribute,
    stage.edgeConfiguration?.kindAttribute,
    stage.edgeConfiguration?.gestationalCarrierAttribute,
    stage.edgeConfiguration?.currentPartnerAttribute,
    stage.nodeConfiguration?.sexAssignedAtBirthAttribute,
  ]);

/** Which stages keep each part of the family's record together
 * (`SharedFamilyRecord`), as their steps. */
export type FamilySharing = Record<keyof SharedFamilyRecord, number[]>;

/**
 * The steps of every Family Pedigree stage that keeps each part of the family
 * record with the one at `step`, itself included. A protocol may have several
 * stages recording the same family, sharing their slots (schema 9), and they
 * then draw and change one family. A stage records the same family only when
 * it binds the same structural slots (`familyOf`): two stages over the same
 * types but marking the participant, or recording relationships, through
 * other attributes record two families.
 *
 * - `standIns`: every stage recording the same family.
 * - `generatedLabels`: of those, the ones that also name people through the
 *   same attribute, since a label is a value saved there.
 */
export function stepsSharingFamily(
  stages: readonly StageSummary[],
  step: number,
): FamilySharing {
  const own = stages[step];
  if (own?.type !== 'FamilyPedigree') {
    return { standIns: [step], generatedLabels: [step] };
  }
  const family = familyOf(own);
  const standIns = stages.flatMap((stage, index) =>
    stage.type === 'FamilyPedigree' && familyOf(stage) === family
      ? [index]
      : [],
  );
  return {
    standIns,
    generatedLabels: standIns.filter(
      (index) =>
        stages[index]?.nodeConfiguration?.nameAttribute ===
        own.nodeConfiguration?.nameAttribute,
    ),
  };
}

/**
 * What the family's people are, beyond what the network records about them,
 * which belongs to the family rather than to the stage that found it out:
 * who holds a label saved as their name because they were left unnamed (by
 * the fingerprint of the value written), and who is an unnamed stand-in the
 * stage generated. Every stage that records the family keeps the same record
 * (`stepsSharingFamily`), so a stand-in one gave is a stand-in to all, and a
 * label one saved is a label to every one naming people where it was saved.
 */
export type SharedFamilyRecord = {
  generatedLabels: Record<string, string>;
  standIns: string[];
};

/**
 * The record the stages `sharing` it keep, together: each part as every
 * stage sharing that part records it. A stage writes each part to all of
 * them (`sharedRecordWrites`), so they differ only in a session saved before
 * they shared it.
 */
export function readSharedFamilyRecord(
  stageMetadata: StageMetadata | null | undefined,
  sharing: FamilySharing,
): SharedFamilyRecord {
  const entryAt = (step: number) => {
    const entry = stageMetadata?.[step];
    return isFamilyPedigreeStageMetadata(entry) ? entry : undefined;
  };
  const generatedLabels: Record<string, string> = {};
  for (const step of sharing.generatedLabels) {
    Object.assign(generatedLabels, entryAt(step)?.generatedLabels);
  }
  const standIns = new Set(
    sharing.standIns.flatMap((step) => entryAt(step)?.standIns ?? []),
  );
  return { generatedLabels, standIns: [...standIns] };
}

const EMPTY: SharedFamilyRecord = { generatedLabels: {}, standIns: [] };

/**
 * The metadata to write at each stage `sharing` the record to record `patch`
 * in it: each part of the patch at the stages sharing that part, keeping
 * whatever else each stage records about itself (the framing its
 * participant chose). Only the steps whose record the patch changes are
 * written.
 */
export function sharedRecordWrites(
  stageMetadata: StageMetadata | null | undefined,
  sharing: FamilySharing,
  patch: Partial<SharedFamilyRecord>,
): { step: number; metadata: NonNullable<StageMetadata[string]> }[] {
  const keys = (Object.keys(patch) as (keyof SharedFamilyRecord)[]).filter(
    (key) => patch[key] !== undefined,
  );
  const steps = [...new Set(keys.flatMap((key) => sharing[key]))].toSorted(
    (a, b) => a - b,
  );
  return steps.flatMap((step) => {
    const stored = stageMetadata?.[step];
    const own = isFamilyPedigreeStageMetadata(stored) ? stored : undefined;
    const here = keys.filter((key) => sharing[key].includes(step));
    const metadata = {
      ...own,
      ...Object.fromEntries(here.map((key) => [key, patch[key]])),
    };
    // Nobody recorded, and no record, are the same.
    const unchanged = here.every(
      (key) =>
        JSON.stringify(own?.[key] ?? EMPTY[key]) === JSON.stringify(patch[key]),
    );
    return unchanged ? [] : [{ step, metadata }];
  });
}
