import { z } from 'zod';

import {
  type DuplicateLabel,
  findDuplicateLocalizedLabels,
} from '../../../localization/duplicateLabels.ts';
import type { LocalizationDeclaration } from '../../../localization/localeTag.ts';
import {
  EVERY_VERSION,
  type MessageArguments,
} from '../../../localization/messageArguments.ts';
import { findDuplicateId } from '../../../utils/validation-helpers.ts';
import { NodeColorReferenceSchema } from '../color-reference.ts';
import { entityAttributeReference } from '../entity-attribute-reference.ts';
import {
  type LocalizedString,
  localizedMessage,
  localizedString,
  nonBlankText,
} from '../localized-string.ts';
import { INHERITANCE_PATTERNS } from '../narrative-pedigree-values.ts';
import { stageReference } from '../stage-reference.ts';
import { withStageSubjectResolution } from '../stage-subject-resolution.ts';
import { baseStageSchema } from './base.ts';

/**
 * Disease rows whose label, as a participant who selected `locale` would see
 * it, repeats an earlier row's, for every declared locale: the rule every set
 * of labels a participant tells apart is held to
 * (`findDuplicateLocalizedLabels`), fallback included.
 */
export const findDuplicateDiseaseLabels = (
  diseases: readonly { label: LocalizedString }[],
  localization: LocalizationDeclaration,
): DuplicateLabel[] =>
  findDuplicateLocalizedLabels(
    diseases.map(({ label }) => label),
    localization,
  );

// The snapshot's heading is built from the stage's title and the condition's
// name, and from the focused person's name too for the inheritance heading.
// A heading must show each of them.
export const SNAPSHOT_CONDITION_ARGUMENTS: MessageArguments = {
  title: { kind: 'text', required: EVERY_VERSION },
  condition: { kind: 'text', required: EVERY_VERSION },
};

export const SNAPSHOT_INHERITANCE_ARGUMENTS: MessageArguments = {
  ...SNAPSHOT_CONDITION_ARGUMENTS,
  name: { kind: 'text', required: EVERY_VERSION },
};

// A narrative pedigree describes the people of the FamilyPedigree it points
// at, so its subject is that stage's alter node type. `sourceStageId` is
// checked separately at protocol level; here an unresolvable id simply yields
// no subject.
const narrativePedigreeStageShape = baseStageSchema.extend({
  type: z.literal('NarrativePedigree'),

  sourceStageId: stageReference('sourceStageId'),

  showAtRiskStatuses: z.boolean().default(false),

  diseases: z
    .array(
      z.strictObject({
        id: z.string(),
        label: localizedString(nonBlankText(), {
          format: 'plain',
          lines: 'single',
        }),
        color: NodeColorReferenceSchema,
        // Boolean attribute on the source pedigree's people: true marks
        // someone as affected. Usually one of the Family Pedigree's nomination
        // prompt attributes ("Who in your family has had…?").
        //
        // Tagged as a writer even though this stage only renders: a disease
        // row DECLARES what the attribute means ("who is affected by X"), and
        // the synthetic generator writes affected status through exactly this
        // mapping. Untagged it would count as a read, and mapping a disease
        // onto a pedigree's own structural slot — the participant marker, the
        // relationship — would pass validation while painting the participant
        // as affected in every interview. `ExclusiveSlotDescriptor` names a
        // disease mapping as a conflict; this tag is what makes that true.
        attribute: entityAttributeReference({
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

      // A disease row maps ONE node attribute to a colour and an inheritance
      // pattern. Two rows on one attribute give the pedigree contradictory
      // answers for a single affected set — the genetics engine resolves one
      // inheritance pattern per attribute, and the key rendered to the
      // participant lists that attribute twice under different colours. Label
      // uniqueness depends on the protocol's locales, so the protocol-level
      // refinement checks it (`findDuplicateDiseaseLabels`).
      diseases.forEach((disease, index) => {
        if (
          diseases.findIndex(
            (candidate) => candidate.attribute === disease.attribute,
          ) === index
        ) {
          return;
        }
        ctx.addIssue({
          code: 'custom' as const,
          message: `Diseases contain duplicate attribute "${disease.attribute}"`,
          path: [index, 'attribute'],
        });
      });
    }),
  // The interview's own words on this stage, which Network Canvas supplies
  // (`stage-wording/narrative-pedigree.ts`); a stage that omits one shows
  // Network Canvas's wording. The key's heading and rows and the clear focus
  // tooltip, which every Narrative Pedigree shows alike, are interface text
  // (`interface-text-wording.ts`).
  saveSnapshot: localizedString(nonBlankText(), {
    format: 'plain',
    lines: 'single',
  }).optional(),
  conditionText: z
    .strictObject({
      selectCondition: localizedString(nonBlankText(), {
        format: 'plain',
        lines: 'single',
      }).optional(),
      snapshotCondition: localizedMessage(nonBlankText(), {
        arguments: SNAPSHOT_CONDITION_ARGUMENTS,
      }).optional(),
      snapshotInheritance: localizedMessage(nonBlankText(), {
        arguments: SNAPSHOT_INHERITANCE_ARGUMENTS,
      }).optional(),
    })
    .optional(),
});

export const narrativePedigreeStage = withStageSubjectResolution(
  narrativePedigreeStageShape,
  {
    from: 'stageRef',
    stageRef: 'sourceStageId',
    // The Family Pedigree's people are its stage subject.
    path: ['subject', 'type'],
    entity: 'node',
  },
);
