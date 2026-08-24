import {
  type ColorReference,
  type NodeColorReference,
  NodeColorSequence,
  type OrdinalColorReference,
} from '../schemas/8/color-reference.ts';

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const LEGACY_NODE_COLOR = /^node-color-seq-(9|10)$/;
const LEGACY_PRIMARY_COLOR = /^primary-color-seq-([1-8])$/;
const CEGRM_RAW_COLOR = '#e53e3e';
const DEVELOPMENT_PEDIGREE_RAW_COLOR = '#cc0000';
const DEVELOPMENT_GEOGRAPHIC_RAW_COLOR = '#3399ff';

type LegacyColorReferenceRepair =
  | {
      kind: 'narrative-pedigree';
      stageIndex: number;
      diseaseIndex: number;
      diseaseLabel?: string;
      from: string;
      to: NodeColorReference;
    }
  | {
      kind: 'geospatial';
      stageIndex: number;
      stageLabel?: string;
      from: string;
      to: ColorReference;
    };

type LegacyColorReferenceRepairResult = {
  /** The input itself when no repair is needed; otherwise a repaired clone. */
  protocol: unknown;
  repairs: LegacyColorReferenceRepair[];
};

/**
 * Repairs exact legacy values generated or shipped by Network Canvas itself:
 * the two undefined node references from the old Narrative Pedigree picker,
 * the CEGRM template and development protocol's raw disease colors, the
 * development protocol's raw map color, and Geospatial's old
 * `primary-color-seq-*` alias.
 *
 * The continuation wraps around the finite sequence, exactly as Architect's
 * entity-colour assignment does: position 9 becomes 1 and position 10 becomes
 * 2. The two known raw values map to the defined sequence entries now used by
 * those same bundled protocols. No other raw/custom value is guessed at.
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
      const position = match ? Number(match[1]) : undefined;
      const normalizedColor = disease.color.toLowerCase();
      const to =
        normalizedColor === CEGRM_RAW_COLOR ||
        normalizedColor === DEVELOPMENT_PEDIGREE_RAW_COLOR
          ? NodeColorSequence[0]
          : position === undefined
            ? undefined
            : NodeColorSequence[(position - 1) % NodeColorSequence.length];
      if (!to) return;
      repairs.push({
        kind: 'narrative-pedigree',
        stageIndex,
        diseaseIndex,
        diseaseLabel:
          typeof disease.label === 'string' ? disease.label : undefined,
        from: disease.color,
        to,
      });
    });
  });

  protocol.stages.forEach((stage, stageIndex) => {
    if (!isRecord(stage) || stage.type !== 'Geospatial') return;
    if (!isRecord(stage.mapOptions)) return;
    const color = stage.mapOptions.color;
    if (typeof color !== 'string') return;
    const primaryMatch = LEGACY_PRIMARY_COLOR.exec(color);
    const primaryPosition = primaryMatch ? Number(primaryMatch[1]) : undefined;
    const to: NodeColorReference | OrdinalColorReference | undefined =
      color.toLowerCase() === DEVELOPMENT_GEOGRAPHIC_RAW_COLOR
        ? 'ord-color-seq-6'
        : primaryPosition === undefined
          ? undefined
          : NodeColorSequence[primaryPosition - 1];
    if (!to) return;
    repairs.push({
      kind: 'geospatial',
      stageIndex,
      stageLabel: typeof stage.label === 'string' ? stage.label : undefined,
      from: color,
      to,
    });
  });

  if (repairs.length === 0) return { protocol, repairs };

  const repaired = structuredClone(protocol);
  if (!isRecord(repaired) || !Array.isArray(repaired.stages)) {
    return { protocol, repairs: [] };
  }
  const repairedStages = repaired.stages;
  repairs.forEach((repair) => {
    const { stageIndex, to } = repair;
    const stage = repairedStages[stageIndex];
    if (!isRecord(stage)) return;
    if (repair.kind === 'geospatial') {
      if (isRecord(stage.mapOptions)) stage.mapOptions.color = to;
      return;
    }
    if (!Array.isArray(stage.diseases)) return;
    const disease = stage.diseases[repair.diseaseIndex];
    if (isRecord(disease)) disease.color = to;
  });

  return { protocol: repaired, repairs };
};
