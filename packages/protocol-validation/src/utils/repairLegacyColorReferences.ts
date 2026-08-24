import {
  type NodeColorReference,
  NodeColorSequence,
} from '../schemas/8/color-reference.ts';

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const LEGACY_NODE_COLOR = /^node-color-seq-(9|10)$/;

type LegacyColorReferenceRepair = {
  stageIndex: number;
  diseaseIndex: number;
  diseaseLabel?: string;
  from: string;
  to: NodeColorReference;
};

type LegacyColorReferenceRepairResult = {
  /** The input itself when no repair is needed; otherwise a repaired clone. */
  protocol: unknown;
  repairs: LegacyColorReferenceRepair[];
};

/**
 * Repairs the two undefined node references that an older Narrative Pedigree
 * picker generated. That picker offered positions 9 and 10 even though the
 * shared theme has always defined only `--node-1` through `--node-8`.
 *
 * The continuation wraps around the finite sequence, exactly as Architect's
 * entity-colour assignment does: position 9 becomes 1 and position 10 becomes
 * 2. No other invalid value is guessed at; raw colours and arbitrary tokens
 * remain validation failures.
 */
export const repairLegacyColorReferences = (
  protocol: unknown,
): LegacyColorReferenceRepairResult => {
  if (!isRecord(protocol) || !Array.isArray(protocol.stages)) {
    return { protocol, repairs: [] };
  }

  const repairs: LegacyColorReferenceRepair[] = [];
  protocol.stages.forEach((stage, stageIndex) => {
    if (!isRecord(stage) || stage.type !== 'NarrativePedigree') return;
    if (!Array.isArray(stage.diseases)) return;
    stage.diseases.forEach((disease, diseaseIndex) => {
      if (!isRecord(disease) || typeof disease.color !== 'string') return;
      const match = LEGACY_NODE_COLOR.exec(disease.color);
      if (!match) return;
      const position = Number(match[1]);
      const to = NodeColorSequence[(position - 1) % NodeColorSequence.length];
      if (!to) return;
      repairs.push({
        stageIndex,
        diseaseIndex,
        diseaseLabel:
          typeof disease.label === 'string' ? disease.label : undefined,
        from: disease.color,
        to,
      });
    });
  });

  if (repairs.length === 0) return { protocol, repairs };

  const repaired = structuredClone(protocol);
  if (!isRecord(repaired) || !Array.isArray(repaired.stages)) {
    return { protocol, repairs: [] };
  }
  const repairedStages = repaired.stages;
  repairs.forEach(({ stageIndex, diseaseIndex, to }) => {
    const stage = repairedStages[stageIndex];
    if (!isRecord(stage) || !Array.isArray(stage.diseases)) return;
    const disease = stage.diseases[diseaseIndex];
    if (isRecord(disease)) disease.color = to;
  });

  return { protocol: repaired, repairs };
};
