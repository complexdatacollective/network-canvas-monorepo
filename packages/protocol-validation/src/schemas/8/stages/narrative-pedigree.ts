import { z } from 'zod';

import {
  INHERITANCE_PATTERNS,
  normalizeForComparison,
} from '@codaco/shared-consts';

import { findDuplicateId } from '../../../utils/validation-helpers.ts';
import { NodeColorReferenceSchema } from '../color-reference.ts';
import { entityAttributeReference } from '../entity-attribute-reference.ts';
import { withStageSubjectResolution } from '../stage-subject-resolution.ts';
import { baseStageSchema } from './base.ts';

/**
 * The key under which two disease labels are the same label.
 *
 * `normalizeForComparison`, never `toLocaleLowerCase()`: this is a
 * PERSISTED-SCHEMA invariant, so the answer has to be the same on every device
 * the protocol is opened on. Locale folding makes it depend on the host — `I`
 * lowercases to `ı` under Turkish and Azeri, so `Ilk` and `ilk` collide on one
 * laptop and not on another — and a raw comparison also misses canonically
 * equivalent spellings of the same label, which render identically to the
 * participant.
 */
export const diseaseLabelKey = (label: string): string =>
  normalizeForComparison(label.trim());

export type DiseaseRowDuplicates = {
  /** Rows whose `variable` repeats an earlier row's. */
  variableDuplicates: number[];
  /** Rows whose label repeats an earlier row's, by `diseaseLabelKey`. */
  labelDuplicates: number[];
};

/**
 * The duplicate rows in a disease list, by the two rules below.
 *
 * Shared with the repair Architect offers, so the two cannot judge duplicates
 * differently — a repair that disagreed with the schema would either rewrite
 * rows the schema was happy with, or leave a protocol the schema still
 * rejects, asking the researcher to approve a fix that fixes nothing every
 * time they open it. `excluding` names rows the caller is already removing:
 * the repair compares labels only across the rows that SURVIVE its variable
 * dedupe, so a row about to be dropped never forces a rename on one that
 * stays. The schema passes nothing and sees every row.
 *
 * Takes `unknown` rows because the repair works on unvalidated protocol data;
 * a row whose `variable` or `label` is not a string is never a duplicate.
 */
export const duplicateDiseaseRows = (
  diseases: readonly unknown[],
  excluding: ReadonlySet<number> = new Set(),
): DiseaseRowDuplicates => {
  const seenVariables = new Set<string>();
  const seenLabels = new Set<string>();
  const variableDuplicates: number[] = [];
  const labelDuplicates: number[] = [];
  diseases.forEach((row, index) => {
    if (typeof row !== 'object' || row === null) return;
    const { variable, label } = row as { variable?: unknown; label?: unknown };
    if (typeof variable === 'string') {
      if (seenVariables.has(variable)) variableDuplicates.push(index);
      else seenVariables.add(variable);
    }
    if (excluding.has(index) || typeof label !== 'string') return;
    const key = diseaseLabelKey(label);
    if (seenLabels.has(key)) labelDuplicates.push(index);
    else seenLabels.add(key);
  });
  return { variableDuplicates, labelDuplicates };
};

// A narrative pedigree describes the people of the FamilyPedigree it points
// at, so its subject is that stage's alter node type. `sourceStageId` is
// checked separately at protocol level; here an unresolvable id simply yields
// no subject.
const narrativePedigreeStageShape = baseStageSchema.extend({
  type: z.literal('NarrativePedigree'),

  sourceStageId: z.string(),

  showAtRiskStatuses: z.boolean().default(false),

  diseases: z
    .array(
      z.strictObject({
        id: z.string(),
        label: z.string().min(1),
        color: NodeColorReferenceSchema,
        // Tagged as a writer even though this stage only renders: a disease
        // row DECLARES what the variable means ("who is affected by X"), and
        // the synthetic generator writes affected status through exactly this
        // mapping. Untagged it would count as a read, and mapping a disease
        // onto a pedigree's own structural slot — the participant marker, the
        // relationship — would pass validation while painting the participant
        // as affected in every interview. `ExclusiveSlotDescriptor` names a
        // disease mapping as a conflict; this tag is what makes that true.
        variable: entityAttributeReference({
          subject: 'stageSubject',
          usage: 'unvalidatedAttribute',
        }),
        inheritancePattern: z.enum([...INHERITANCE_PATTERNS]),
      }),
    )
    .min(1)
    .superRefine((diseases, ctx) => {
      const duplicateId = findDuplicateId(diseases);
      if (duplicateId) {
        ctx.addIssue({
          code: 'custom' as const,
          message: `Diseases contain duplicate ID "${duplicateId}"`,
          path: [],
        });
      }

      // A disease row maps ONE node variable to a colour and an inheritance
      // pattern. Two rows on one variable give the pedigree contradictory
      // answers for a single affected set — the genetics engine resolves one
      // inheritance pattern per variable, and the key rendered to the
      // participant lists that variable twice under different colours. Labels
      // are the participant-facing key, so two rows sharing one are
      // indistinguishable on screen whatever they map to.
      const { variableDuplicates, labelDuplicates } =
        duplicateDiseaseRows(diseases);
      for (const index of variableDuplicates) {
        ctx.addIssue({
          code: 'custom' as const,
          message: `Diseases contain duplicate attribute "${diseases[index]?.variable}"`,
          path: [index, 'variable'],
        });
      }
      for (const index of labelDuplicates) {
        ctx.addIssue({
          code: 'custom' as const,
          message: `Diseases contain duplicate label "${diseases[index]?.label}"`,
          path: [index, 'label'],
        });
      }
    }),
});

export const narrativePedigreeStage = withStageSubjectResolution(
  narrativePedigreeStageShape,
  {
    from: 'stageRef',
    stageRef: 'sourceStageId',
    path: ['nodeConfig', 'type'],
    entity: 'node',
  },
);
