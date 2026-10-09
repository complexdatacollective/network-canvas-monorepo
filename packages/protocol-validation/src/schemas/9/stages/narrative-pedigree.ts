import { z } from 'zod';

import { normalizeForComparison } from '@codaco/shared-consts';

import type { LocalizationDeclaration } from '../../../localization/localeTag.ts';
import { messageText } from '../../../localization/messageSyntax.ts';
import { resolveLocalizedString } from '../../../localization/resolveLocalizedString.ts';
import { findDuplicateId } from '../../../utils/validation-helpers.ts';
import { NodeColorReferenceSchema } from '../color-reference.ts';
import { entityAttributeReference } from '../entity-attribute-reference.ts';
import {
  type LocalizedString,
  localizedString,
  nonBlankText,
} from '../localized-string.ts';
import { INHERITANCE_PATTERNS } from '../narrative-pedigree-values.ts';
import { stageReference } from '../stage-reference.ts';
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

type DuplicateDiseaseLabel = Readonly<{
  index: number;
  locale: string;
  text: string;
}>;

/**
 * Disease rows whose label, as a participant who selected `locale` would see
 * it, repeats an earlier row's, for every declared locale.
 *
 * Each label is resolved with the runtime's own fallback before comparing, so
 * a collision that only appears through fallback (one row translated, another
 * falling back to the same default text) is caught in the locale it affects.
 * Labels are resolved as for a participant whose browser lists no other
 * protocol language, so a collision reached only through such a language is
 * not caught. A label with no declared translation cannot be resolved and is
 * skipped; the protocol refinement already rejects it.
 */
export const findDuplicateDiseaseLabels = (
  diseases: readonly { label: LocalizedString }[],
  localization: LocalizationDeclaration,
): DuplicateDiseaseLabel[] => {
  const duplicates: DuplicateDiseaseLabel[] = [];
  for (const locale of localization.locales) {
    const seen = new Set<string>();
    diseases.forEach(({ label }, index) => {
      if (
        !localization.locales.some((declared) => Object.hasOwn(label, declared))
      ) {
        return;
      }
      const text = messageText(
        resolveLocalizedString(label, localization, [locale]).text,
      );
      const key = diseaseLabelKey(text);
      if (seen.has(key)) duplicates.push({ index, locale, text });
      else seen.add(key);
    });
  }
  return duplicates;
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
        label: localizedString(nonBlankText(), 'plain'),
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
