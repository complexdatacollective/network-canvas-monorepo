import {
  collectLocalizedStringsFromSchema,
  dynamicValueReferencesIn,
  type LocalizationDeclaration,
  logicReads,
  optionIdFromCaseKey,
  parseDynamicValueName,
  readDynamicAttributeLogic,
  removedOptionIds,
  stageSchema,
  withoutRemovedOptionVersions,
  withoutUnusedTextDefinitions,
} from '@codaco/protocol-validation';
import { isRecord } from '@codaco/shared-consts';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import {
  savedStageFields,
  stageDocument,
  type StageFormDraft,
  type StageIdentity,
} from '../stageDocument.ts';
import type { StagedCodebook } from '../state/stagedCodebook.ts';

/**
 * The stage's fields as a save writes them, from the fields that the form
 * submitted:
 *
 * 1. holding exactly the wording settings that apply to the stage
 *    (`savedStageFields`), so the schema judges what is saved;
 * 2. without the versions that its text and dynamic attributes write for
 *    options that the stage's codebook changes leave out
 *    (`withoutVersionsForStagedRemovals`);
 * 3. without the form fields, dynamic attributes and conditions that nothing
 *    uses any more, however their last use went
 *    (`withoutUnusedTextDefinitions`).
 *
 * The order is the contract: a version taken out in step 2 may have been the
 * last use of a field or a dynamic attribute, which step 3 then leaves out.
 */
export function stageAsSaved(
  identity: StageIdentity,
  submitted: StageFormDraft,
  {
    localization,
    staged,
  }: Readonly<{
    localization: LocalizationDeclaration | undefined;
    staged: StagedCodebook;
  }>,
): StageFormDraft {
  return withoutUnusedTextDefinitionsIn(
    identity,
    withoutVersionsForStagedRemovals(
      identity,
      savedStageFields(identity, submitted, localization),
      staged,
    ),
    localization,
  );
}

/**
 * `fields` as a save writes them (`withoutUnusedTextDefinitions`), read as
 * the stage of `identity`: the stage's type says which fields are its text.
 */
function withoutUnusedTextDefinitionsIn(
  identity: StageIdentity,
  fields: StageFormDraft,
  localization: LocalizationDeclaration | undefined,
): StageFormDraft {
  const stage = { ...fields, id: identity.id, type: identity.type };
  const kept = withoutUnusedTextDefinitions(stage, localization);
  if (kept === stage) return fields;
  const { id: _id, type: _type, ...pruned } = kept;
  return pruned;
}

/**
 * `fields` without the versions that the stage's text and dynamic attributes
 * write for options that a variable in the stage's changed codebook sections
 * does not have (see `withoutRemovedOptionVersions`). An option can be
 * deleted from inside a stage editor (the Family Pedigree manages its gender
 * identity options there), and the stage's own text or one of its dynamic
 * attributes may have a version for it. That version names an option that
 * no longer exists, so the stage's check would refuse the save until the
 * researcher found and removed it.
 *
 * The text is compared with the options each changed variable has as the
 * edit leaves it (`edited`), not with what the protocol held before (`base`):
 * an option created and removed in the same edit, or on a variable or section
 * the edit created, was never in the protocol, and its version must go too.
 * Text about a variable that no changed section has is left as it is.
 */
function withoutVersionsForStagedRemovals(
  identity: StageIdentity,
  fields: StageFormDraft,
  staged: StagedCodebook,
): StageFormDraft {
  const sections = Object.values(staged).map(({ edited }) => edited);
  if (sections.length === 0) return fields;
  const removed = removedOptionIds(
    [optionsTheTextChooses(identity, fields)],
    sections,
  );
  if (removed.size === 0) return fields;
  let protocol: Readonly<{ stages: readonly SectionDoc[] }> = {
    stages: [{ ...fields, id: identity.id, type: identity.type }],
  };
  for (const [variableId, optionIds] of removed) {
    protocol = withoutRemovedOptionVersions(protocol, variableId, optionIds);
  }
  const [stage] = protocol.stages;
  if (stage === undefined) return fields;
  const { id: _id, type: _type, ...pruned } = stage;
  return pruned;
}

/**
 * The options that the stage's text gives a version for, in any translation,
 * by the variable whose select chooses them, and the options that the
 * stage's dynamic attributes give a version for, by the variable whose
 * answers they read. They are returned in the shape of a codebook record
 * that holds variables, so that `removedOptionIds` can compare them with the
 * options the changed sections have.
 */
function optionsTheTextChooses(
  identity: StageIdentity,
  fields: StageFormDraft,
): Readonly<{
  variables: Record<string, { options: { id: string }[] }>;
}> {
  const byVariable = new Map<string, Set<string>>();
  const chooses = (variableId: string, caseKeys: readonly string[]) => {
    const options = byVariable.get(variableId) ?? new Set();
    for (const key of caseKeys) {
      const optionId = optionIdFromCaseKey(key);
      if (optionId !== undefined) options.add(optionId);
    }
    byVariable.set(variableId, options);
  };
  const document = stageDocument(identity, fields);
  for (const { value } of collectLocalizedStringsFromSchema(
    stageSchema,
    document,
  )) {
    for (const message of Object.values(value)) {
      for (const { parsed, caseKeys } of dynamicValueReferencesIn(message)) {
        if (parsed?.kind === 'attribute') chooses(parsed.variableId, caseKeys);
      }
    }
  }
  // A dynamic attribute of the stage gives a version for an answer outside
  // any text: in its logic (`logicReads`), read leniently, as a dynamic
  // attribute that is still being written has it.
  const definitions: unknown = fields.dynamicAttributes;
  if (isRecord(definitions)) {
    for (const definition of Object.values(definitions)) {
      const logic = readDynamicAttributeLogic(definition);
      if (logic === undefined) continue;
      for (const { name, caseKeys } of logicReads(logic).values) {
        const value = parseDynamicValueName(name);
        if (value?.kind === 'attribute' && caseKeys.length > 0) {
          chooses(value.variableId, caseKeys);
        }
      }
    }
  }
  return {
    variables: Object.fromEntries(
      [...byVariable].map(([variableId, options]) => [
        variableId,
        { options: [...options].map((id) => ({ id })) },
      ]),
    ),
  };
}
