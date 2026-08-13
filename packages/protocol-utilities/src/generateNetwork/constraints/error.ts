export type ConstraintConflict = {
  entity: 'ego' | 'node' | 'edge';
  /** The codebook key, which a programmatic consumer needs to locate the type. */
  entityType?: string;
  /** The type's human-readable name, absent only when the codebook omits one. */
  entityTypeName?: string;
  variableIds: string[];
  variableNames: string[];
  rules: string[];
  reason: string;
};

const NO_VALUE_CAN_SATISFY =
  'this protocol declares validation rules that no value can satisfy';

/**
 * The single refusal a consumer catches. Generation refuses in two places —
 * before drawing, where the declared bounds alone prove a rule unsatisfiable,
 * and while drawing, where a variable runs out of values against the ones its
 * rules tie it to — and both mean the same thing to whoever configured the
 * protocol. `summary` is the lead sentence, because only the first of those can
 * claim no value exists at all.
 */
export class SyntheticDataConstraintError extends Error {
  readonly conflicts: ConstraintConflict[];

  constructor(
    conflicts: ConstraintConflict[],
    summary: string = NO_VALUE_CAN_SATISFY,
  ) {
    const lines = conflicts.map((conflict) => {
      const subject =
        conflict.entity === 'ego'
          ? 'ego'
          : `${conflict.entity} "${conflict.entityTypeName ?? conflict.entityType}"`;
      // A conflict need not be about variables — a roster too small for its
      // stages names none — so the variable clause is omitted rather than
      // rendered as an empty gap between commas.
      const named = conflict.variableNames
        .map((name) => `"${name}"`)
        .join(' and ');
      const about = named === '' ? subject : `${subject}, ${named}`;
      return `  - ${about} (${conflict.rules.join(', ')}): ${conflict.reason}`;
    });

    super(
      `Synthetic data cannot be generated: ${summary}.\n${lines.join('\n')}`,
    );
    this.name = 'SyntheticDataConstraintError';
    this.conflicts = conflicts;
  }
}
