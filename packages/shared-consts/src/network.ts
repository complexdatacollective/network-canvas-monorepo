import { z } from 'zod';

// When values are encrypted, this is the resulting type.
const encryptedValueSchema = z.array(z.number());
export type EncryptedValue = z.infer<typeof encryptedValueSchema>;

export const VariableValueSchema = z.union([
  z.string(), // text, ordinal option value, location
  z.boolean(),
  z.number(), // number, ordinal option value, visual analog scale
  encryptedValueSchema,
  z.array(z.union([z.string(), z.number(), z.boolean()])), // categorical (selected option values)
  z.object({
    x: z.number(),
    y: z.number(),
  }), // layout
]);

export type VariableValue = z.output<typeof VariableValueSchema>;

export const entityPrimaryKeyProperty = '_uid';
export type EntityPrimaryKey = typeof entityPrimaryKeyProperty;
export const entitySecureAttributesMeta = '_secureAttributes';
export type EntitySecureAttributesMeta = typeof entitySecureAttributesMeta;
export const entityAttributesProperty = 'attributes';
export type EntityAttributesProperty = typeof entityAttributesProperty;
export const edgeSourceProperty = 'from';
export const edgeTargetProperty = 'to';

const LegacyEntityAttributesSchema = z.record(
  z.string(),
  VariableValueSchema.nullish(),
);

const removeNullishAttributeValues = (attributes: unknown): unknown => {
  const result = LegacyEntityAttributesSchema.safeParse(attributes);

  if (!result.success) {
    return attributes;
  }

  return Object.fromEntries(
    Object.entries(result.data).filter(
      ([, value]) => value !== null && value !== undefined,
    ),
  );
};

export const EntityAttributesSchema = z.preprocess(
  removeNullishAttributeValues,
  z.record(z.string(), VariableValueSchema),
);

/**
 * How one stored encrypted value was produced: the initialisation vector of
 * its encryption. The key it was encrypted with is the interview's, derived
 * from the participant's passphrase and the interview's id; nothing about the
 * key, and nothing that would check a passphrase, is stored with the network.
 *
 * `salt` is only ever present on a value written by the experimental schema 8
 * feature, which derived a key per value. Such a value cannot be decrypted
 * any more; it is accepted so the network it belongs to still loads.
 */
const SecureAttributeMetaSchema = z.object({
  iv: z.array(z.number()),
  salt: z.array(z.number()).optional(),
});

const BaseNcEntitySchema = z.object({
  [entityPrimaryKeyProperty]: z.string().readonly(),
  [entityAttributesProperty]: EntityAttributesSchema,
  [entitySecureAttributesMeta]: z
    .record(z.string(), SecureAttributeMetaSchema)
    .optional(),
});

const NcNodeSchema = BaseNcEntitySchema.extend({
  type: z.string(),
  stageId: z.string().optional(),
  promptIDs: z.array(z.string()).optional(),
});

export type NcNode = z.infer<typeof NcNodeSchema>;

export const NcEdgeSchema = BaseNcEntitySchema.extend({
  type: z.string(),
  from: z.string(),
  to: z.string(),
});

export type NcEdge = z.infer<typeof NcEdgeSchema>;

export const NcEntity = z.union([
  NcNodeSchema,
  NcEdgeSchema,
  BaseNcEntitySchema,
]);
export type NcEntity = z.infer<typeof NcEntity>;

export type NcEgo = z.infer<typeof BaseNcEntitySchema>;

/**
 * The shortest passphrase an interview accepts when the stage that asks for
 * it sets no minimum of its own, unless its maximum is shorter (see
 * `effectivePassphraseMinLength`).
 */
export const DEFAULT_PASSPHRASE_MIN_LENGTH = 8;

/**
 * The shortest passphrase an interview accepts under a stage's length rules.
 *
 * A minimum the researcher sets replaces the default, even when it is lower.
 * Without one the default applies, lowered to the researcher's maximum when
 * that is shorter: a default above the maximum would leave no passphrase a
 * participant could choose.
 */
export function effectivePassphraseMinLength(
  rules: { minLength?: number; maxLength?: number } | undefined,
): number {
  if (rules?.minLength !== undefined) return rules.minLength;
  if (rules?.maxLength === undefined) return DEFAULT_PASSPHRASE_MIN_LENGTH;
  return Math.min(DEFAULT_PASSPHRASE_MIN_LENGTH, rules.maxLength);
}

export const NcNetworkSchema = z.object({
  nodes: z.array(NcNodeSchema),
  edges: z.array(NcEdgeSchema),
  ego: BaseNcEntitySchema,
});

export type NcNetwork = z.output<typeof NcNetworkSchema>;
