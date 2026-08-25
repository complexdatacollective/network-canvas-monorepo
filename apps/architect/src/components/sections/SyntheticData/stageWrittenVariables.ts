import {
  collectVariableRoleHits,
  syntheticSubjectKey,
  type VariableRoleGroup,
  type VariableRoleHit,
} from '@codaco/protocol-validation';

import type { StageDraft } from './stageSynthetic';

/**
 * The variables a stage writes with its OWN structure — the ones whose
 * generated values a researcher editing this stage is actually deciding
 * (spec revision 2, item 4).
 *
 * Derived from the schema's own reading of who writes what
 * (`collectVariableRoleHits`, the walk `collectInterfaceImpliedRules` reads
 * writers through), never from a table of stage types. Two consequences that
 * are the whole reason for going through the walk:
 *
 *  - a stage type that gains a bound variable is covered the moment its schema
 *    is tagged, with nothing here to change;
 *  - "who writes this variable" means one thing across the app, so a bin whose
 *    variable this section offers to edit is the same bin the implied-rule
 *    notes name.
 *
 * PRIMARY, not every writer. A form-bearing stage names a variable per field,
 * and a stage editor that grew a synthetic sub-editor for each of them would
 * be a codebook screen wearing a stage's name. What is primary is a slot the
 * stage carries in its own right:
 *
 *  - `stages[i].quickAdd` — the one attribute a quick-add palette collects;
 *  - `stages[i].prompts[j].variable` — the attribute a prompt binds: the
 *    bins' bin variable and the Geospatial map's assignment;
 *  - `stages[i].nominationPrompts[j].variable` and
 *    `stages[i].diseases[j].variable` — the pedigree interfaces' own slots,
 *    the same one-variable-per-entry shape under a different list name. A
 *    FamilyPedigree resolves here (its subject lives on its own nodeConfig);
 *    a NarrativePedigree's subject lives on its SOURCE stage, which the
 *    one-stage walk below cannot see, so its disease attributes remain
 *    codebook-edited.
 *
 * Both are PATH SHAPES rather than stage-type lists. The stage-type sets in
 * `collectInterfaceImpliedRules` answer a different question — which RULE a
 * writer implies — and restating them here would tie "this stage's own
 * attribute" to the interfaces that happen to imply a rule today.
 *
 * Everything deeper is deliberately out: a prompt's `additionalAttributes`,
 * a sociogram's tap-to-highlight, a composer's node form, and every form field
 * live further down their own paths and belong to the codebook.
 */

/** One attribute a stage writes through a slot of its own. */
export type StageWrittenVariable = {
  variableId: string;
  subject: VariableRoleGroup['subject'];
  /** The stage-relative path that names it, e.g. `prompts.0.variable`. */
  path: string;
};

const QUICK_ADD_PATH_LENGTH = 3;
const PROMPT_VARIABLE_PATH_LENGTH = 5;

/**
 * The list-of-slots collections whose entries bind one variable each in the
 * stage's own right: a prompt (the bins' bin variable, the Geospatial map's
 * assignment), a FamilyPedigree nomination prompt, and a NarrativePedigree
 * disease mapping all share the `stages[0].<list>[j].variable` shape.
 */
const PRIMARY_SLOT_LISTS = new Set([
  'prompts',
  'nominationPrompts',
  'diseases',
]);

/**
 * Whether this writer is one of the stage's own primary slots.
 *
 * The walk is entered on a document holding this stage alone, so the stage
 * index is always 0 and the shape is all that has to be read.
 */
const isPrimarySlot = (path: VariableRoleHit['path']): boolean => {
  if (path[0] !== 'stages') return false;
  if (path.length === QUICK_ADD_PATH_LENGTH) return path[2] === 'quickAdd';
  if (path.length === PROMPT_VARIABLE_PATH_LENGTH) {
    return (
      typeof path[2] === 'string' &&
      PRIMARY_SLOT_LISTS.has(path[2]) &&
      path[4] === 'variable'
    );
  }
  return false;
};

/**
 * The stage's own primary written variables, in the order the stage names
 * them.
 *
 * Walked over a document holding ONLY this stage, so the answer describes the
 * draft in the editor rather than the saved protocol — a bin whose variable
 * was just picked is covered before anything is saved — and so the walk stays
 * proportional to one stage rather than to the protocol.
 *
 * De-duplicated by (subject, variable): two prompts binding one attribute are
 * one attribute to edit, and rendering its sub-editor twice would be two
 * controls writing one codebook key.
 */
export const stagePrimaryWrittenVariables = (
  draft: StageDraft,
): StageWrittenVariable[] => {
  const found = new Map<string, StageWrittenVariable>();

  for (const group of collectVariableRoleHits({ stages: [draft] })) {
    for (const hit of [...group.validated, ...group.unvalidated]) {
      if (!isPrimarySlot(hit.path)) continue;
      const key = `${syntheticSubjectKey(group.subject)}:${group.variableId}`;
      if (found.has(key)) continue;
      found.set(key, {
        variableId: group.variableId,
        subject: group.subject,
        // Stage-relative: the leading `stages.0` is an artefact of the
        // one-stage document this walk was entered on.
        path: hit.path.slice(2).join('.'),
      });
    }
  }

  return [...found.values()].toSorted((a, b) => a.path.localeCompare(b.path));
};
