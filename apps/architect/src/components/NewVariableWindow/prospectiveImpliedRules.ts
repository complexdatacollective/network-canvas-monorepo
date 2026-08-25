import { cloneDeep, set } from 'es-toolkit/compat';
import { useCallback, useContext } from 'react';

import {
  NO_IMPLIED_RULES,
  variableImpliedRules,
  type VariableImpliedRules,
} from '~/components/Codebook/VariableSynthetic/impliedRules';
import { StageFormContext } from '~/components/StageEditor/stageFormContext';

/**
 * What the stage that opened the create-attribute dialog would impose on the
 * attribute being created.
 *
 * An attribute created from a stage editor is bound to that stage's slot the
 * instant the dialog closes, so the rules the stage implies are already true of
 * it while it is still being defined. Without them the dialog offers a chance
 * of no answer for a value a quick add always collects, and a spread of
 * selections for a value a bin assigns one of — settings the codebook editor
 * then renders disabled, and generation ignores.
 *
 * The question is asked of the schema rather than answered here (spec governing
 * rule 1): the collector is run over a document holding the owning stage with
 * its slot filled by a placeholder id, and the rules it reports for that
 * placeholder are the rules the attribute will be held to.
 * `collectInterfaceImpliedRules` decides which interfaces impose what, so a
 * stage type that starts implying something reaches this dialog with nothing
 * here to change — and a slot that implies nothing (a group hull, a pedigree
 * label) resolves to exactly the empty rules the Codebook's own "add attribute"
 * buttons already get.
 */

/**
 * The id the prospective attribute occupies its slot under while the collector
 * walks. Unmistakable for a real codebook key, so nothing else in the document
 * can contribute a writer to it.
 */
const PROSPECTIVE_VARIABLE_ID = '__architect-prospective-attribute__';

/**
 * That same id, made true of THIS stage rather than merely improbable.
 *
 * The claim above is what the whole reading rests on: rules collected for the
 * placeholder are the rules of the slot it was written into, and of nothing
 * else. A stage that already mentioned the placeholder somewhere — an imported
 * document whose author chose that literal string as an attribute key — would
 * have its own writer for it grouped with the inserted one, and the dialog
 * would offer settings for rules no new attribute is actually held to.
 *
 * Costs one serialisation of a single stage, and only where a mention is
 * actually found does it lengthen the id. A draft that cannot be serialised is
 * one no protocol could hold, and falls back to the plain id, which is where
 * this started.
 */
const placeholderFor = (stage: OwningStageDraft): string => {
  let written: string;
  try {
    written = JSON.stringify(stage) ?? '';
  } catch {
    return PROSPECTIVE_VARIABLE_ID;
  }
  let candidate = PROSPECTIVE_VARIABLE_ID;
  while (written.includes(candidate)) candidate = `${candidate}_`;
  return candidate;
};

/** The stage as its editor holds it, mid-edit. */
export type OwningStageDraft = Record<string, unknown>;

/**
 * Reads the stage the editor is holding, for asking what one of its slots
 * implies — or `undefined` where the surface asking is not inside a stage form,
 * in which case no stage owns the attribute and nothing is implied about it.
 *
 * A READER rather than a value, called when the create-attribute window opens
 * rather than on every render. The alternative — subscribing to the form store
 * so the draft stayed current — put a whole-form subscription inside editors
 * that register and unregister fields as they render: FamilyPedigree's node
 * configuration then re-rendered on its own field registrations, re-registered
 * on the re-render, and hit React's update-depth limit before the section had
 * finished mounting. Nothing needs the draft until the window opens, and at
 * that moment reading it directly is both cheaper and fresher.
 *
 * The committed stage under the form's own values: `getFormValues()` reports
 * REGISTERED fields, so it carries the subject and the slots but never the
 * stage's identity — no field owns `type`, and without it the walk cannot pick
 * the stage schema to read the slot through. Merging rather than overwriting is
 * safe for this one question, where a surface describing what a SAVE would
 * commit must overwrite (see `withStageIdentity`): a key the researcher removed
 * can only take a writer away from some other attribute, and the placeholder's
 * rules come from the slot filled below and from nothing else.
 *
 * The store is read here rather than through `useStageFormValues`, which
 * requires the stage form context this hook has to tolerate the absence of:
 * "no stage form above me" is a real answer — the Codebook's own add-attribute
 * buttons open the same dialog with no stage behind it — rather than the
 * mistake `useStageFormContext`'s throw reports.
 */
export const useOwningStageReader = (): (() =>
  | OwningStageDraft
  | undefined) => {
  const stageForm = useContext(StageFormContext);
  const storeApi = stageForm?.storeApi;
  const committedStage = stageForm?.committedStage;

  return useCallback(
    () =>
      storeApi
        ? { ...committedStage, ...storeApi.getState().getFormValues() }
        : undefined,
    [storeApi, committedStage],
  );
};

/**
 * The implied rules for an attribute that does not exist yet, from the stage
 * that is about to own it.
 *
 * `slotPath` is stage-relative and names the field the new attribute's id will
 * be written into — `quickAdd`, `nodeConfig.egoVariable`, `prompts.0.variable`.
 * An index in it is arbitrary: what a slot implies is decided by the shape of
 * its path and by the stage's type, so filling an occupied position in this
 * throwaway document takes a writer away from the attribute that sat there and
 * changes nothing about the placeholder's own rules.
 */
export const prospectiveImpliedRules = (
  stage: OwningStageDraft | null | undefined,
  slotPath: string | null | undefined,
  subject: { entity: 'node' | 'edge' | 'ego'; type?: string | undefined },
): VariableImpliedRules => {
  if (!stage || !slotPath) return NO_IMPLIED_RULES;

  const placeholder = placeholderFor(stage);
  // Cloned because the draft handed in is the editor's live form values, and
  // `set` writes through every object on the path.
  const occupied = set(cloneDeep(stage), slotPath, placeholder);

  return variableImpliedRules({ stages: [occupied] }, subject, placeholder);
};
