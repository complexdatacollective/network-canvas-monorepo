export type ConstraintConflict = {
  entity: 'ego' | 'node' | 'edge';
  /** The codebook key, which a programmatic consumer needs to locate the type. */
  entityType?: string;
  /** The type's human-readable name, absent only when the codebook omits one. */
  entityTypeName?: string;
  /**
   * The stage that owns this conflict, where ONE stage does: a roster whose
   * resolved pool cannot reach its own min-nodes gate, or a stage asked to
   * enumerate more pairs than one stage may. Set structurally by the producer
   * rather than read back out of `reason`, so a surface that routes conflicts
   * to a stage editor never has to parse the prose written for a human.
   *
   * Absent where no single stage owns it — a `unique` slot exhausted across
   * every stage that writes the type belongs to the protocol, not to any one
   * screen, and a caller distributing conflicts over stages must leave those
   * to its protocol-level verdict rather than repeat them on each stage.
   */
  stageId?: string;
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
      return `  - ${subject}, ${conflict.variableNames.map((name) => `"${name}"`).join(' and ')} (${conflict.rules.join(', ')}): ${conflict.reason}`;
    });

    super(
      `Synthetic data cannot be generated: ${summary}.\n${lines.join('\n')}`,
    );
    this.name = 'SyntheticDataConstraintError';
    this.conflicts = conflicts;
  }
}
