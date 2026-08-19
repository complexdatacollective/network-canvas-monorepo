import { z } from 'zod';

import type { VariableType } from './variables/types.ts';

export const ENTITY_ATTRIBUTE_REFERENCE = 'entityAttributeReference' as const;

export type SubjectResolution =
  | 'stageSubject'
  | 'ego'
  | 'owningVariable'
  // Extracted for usage detection but existence-checked by the dedicated
  // filter-rule validation (rule-scoped subject), not the entity-attribute
  // validator.
  | 'filterRule'
  | { sibling: string; entity: 'node' | 'edge' };

export type AttributeWriterUsage =
  | 'validatedAttribute'
  | 'unvalidatedAttribute';

/**
 * Declares a reference as an interface's own STRUCTURAL slot: the interface
 * derives the attribute's values from the structure the participant builds, so
 * nothing else in the protocol may name that variable for the same subject.
 *
 * The rule is SLOT-AWARE, not variable-aware: the same declared slot on any
 * number of stages may name one variable (two FamilyPedigree stages over one
 * node type legitimately share `is_ego`), while every other reference — a
 * nomination prompt, a disease mapping, a form field, a bin — is a conflict.
 */
export type ExclusiveSlotDescriptor = {
  /** Stable identity of the slot, shared by every stage that declares it. */
  slot: string;
  /**
   * Researcher-facing description of what owns the variable, used verbatim in
   * validation messages ("… is set by <owner> …"), so it must read as a whole
   * localisable phrase rather than a fragment assembled at the call site.
   */
  owner: string;
};

/**
 * Names an interface-owned option set (see `interface-owned-options.ts`). The
 * interface both writes and reads these values, so the option list is fixed:
 * the codebook variable must carry exactly that set, and no editor may offer
 * to change it. Independent of `exclusive` — a variable may legitimately be
 * bound elsewhere (a Categorical Bin sorting family members by biological sex)
 * while its options stay locked.
 */
export type InterfaceOwnedOptionSetKey =
  | 'biologicalSex'
  | 'relationshipType'
  | 'gameteRole';

/**
 * Whether the value at this site is GUARANTEED to name a codebook attribute.
 *
 * `'unchecked'` marks a site whose value may legitimately not be one — a
 * roster data-source column, a prompt sort key left behind by a codebook edit.
 * The reference is still COLLECTED, so "where is this variable used?" and the
 * deletion gate that reads the same index stay complete and cannot disagree;
 * it is simply never existence- or type-validated, so a protocol that has
 * always opened cannot newly fail to. The `filterRule` subject resolution
 * already relies on the same collect-without-checking behaviour, by way of a
 * subject the entity-attribute validator cannot resolve.
 */
export type AttributeExistence = 'unchecked';

export type EntityAttributeReferenceDescriptor = {
  subject: SubjectResolution;
  requireType?: readonly VariableType[];
  /** See `AttributeExistence`. Omitted means the attribute must exist. */
  existence?: AttributeExistence;
  /**
   * Literal values at this site that are magic keys rather than attribute ids
   * (the nomination-order sort key `'*'`). No hit is emitted for them, so a
   * magic key never enters a usage index as a phantom variable.
   */
  ignoreValues?: readonly string[];
  /**
   * How the interview writes through this reference: via the form system
   * (codebook validation applies) or via a direct dispatch (it does not).
   * Absent on read-only references. Static schema metadata — never stored in
   * protocols; the collector's hits inherit it from the matching site.
   */
  usage?: AttributeWriterUsage;
  /**
   * A sibling field, in the SAME object as this reference, that must be `true`
   * before the write described by `usage` happens at all. Where it is not, the
   * site is a READ and the collected hit carries no `usage`.
   *
   * The Sociogram's `highlight` is what this exists for. `highlight.variable`
   * always colours nodes, but only a highlight the participant can TAP
   * (`allowHighlighting: true`) writes the attribute back; with highlighting
   * off the interface merely displays a value something else set — exactly the
   * legitimate read `findExclusiveVariableConflicts` describes. Tagging the
   * site unconditionally would forbid colouring a family pedigree's nodes by
   * the participant marker the pedigree itself derives.
   */
  usageRequiresSibling?: string;
  /** See `ExclusiveSlotDescriptor`. */
  exclusive?: ExclusiveSlotDescriptor;
  /** See `InterfaceOwnedOptionSetKey`. */
  ownedOptions?: InterfaceOwnedOptionSetKey;
};

export const entityAttributeReference = (
  descriptor: EntityAttributeReferenceDescriptor,
) =>
  z
    .string()
    .brand<'EntityAttributeReference'>()
    .meta({ [ENTITY_ATTRIBUTE_REFERENCE]: descriptor });

export type EntityAttributeReference = z.infer<
  ReturnType<typeof entityAttributeReference>
>;

export const asEntityAttributeReference = (
  id: string,
): EntityAttributeReference => id as EntityAttributeReference;

export const getEntityAttributeReferenceDescriptor = (
  schema: z.ZodType,
): EntityAttributeReferenceDescriptor | undefined => {
  const meta = schema.meta();
  const descriptor = meta?.[ENTITY_ATTRIBUTE_REFERENCE];
  return descriptor as EntityAttributeReferenceDescriptor | undefined;
};
