import type { Codebook } from '../schemas/9/codebook/codebook.ts';
import { getStageNodeTypes } from '../schemas/9/stage-capabilities.ts';
import type { Stage } from '../schemas/9/stages/index.ts';
import { collectEntityAttributeReferences } from './collectEntityAttributeReferences.ts';
import { valueAt } from './protocolObjectIdRewrite.ts';

type LayoutAccess = 'sets' | 'reads';

export type StageLayoutUse = {
  layoutId: string;
  access: LayoutAccess;
  nodeTypes: readonly string[];
  stageId: string;
  presetId?: string;
};

type LayoutProtocol = {
  codebook: Pick<Codebook, 'layouts'>;
  stages: readonly Stage[];
};

export type LayoutUsage = {
  setBy: StageLayoutUse[];
  readBy: StageLayoutUse[];
  nodeTypes: readonly string[];
};

/**
 * The layouts a stage names, and whether it sets each (participants or the
 * automatic layout place nodes in it) or only reads it (shows positions
 * another stage set). Every Sociogram sets its layout until its prompts are
 * tasks; a Network Composer always does; a Narrative preset reads.
 */
export const getStageLayoutUses = (stage: Stage): StageLayoutUse[] => {
  const nodeTypes = getStageNodeTypes(stage);
  if (stage.type === 'Sociogram' || stage.type === 'NetworkComposer') {
    return [
      { layoutId: stage.layout, access: 'sets', nodeTypes, stageId: stage.id },
    ];
  }
  if (stage.type === 'Narrative') {
    return stage.presets.map((preset) => ({
      layoutId: preset.layout,
      access: 'reads',
      nodeTypes,
      stageId: stage.id,
      presetId: preset.id,
    }));
  }
  return [];
};

/**
 * Every layout of the codebook with the stage uses that set and read it, and
 * the node types that have it: the types of the stages that set it. Reading
 * a layout gives no type a position in it.
 */
export const getLayoutUsage = (
  protocol: LayoutProtocol,
): Record<string, LayoutUsage> => {
  const usage: Record<string, LayoutUsage> = {};
  const entryFor = (layoutId: string): LayoutUsage => {
    const existing = usage[layoutId];
    if (existing) return existing;
    const created: LayoutUsage = { setBy: [], readBy: [], nodeTypes: [] };
    usage[layoutId] = created;
    return created;
  };
  for (const layoutId of Object.keys(protocol.codebook.layouts ?? {})) {
    entryFor(layoutId);
  }
  for (const stage of protocol.stages) {
    for (const use of getStageLayoutUses(stage)) {
      const entry = entryFor(use.layoutId);
      if (use.access === 'reads') {
        entry.readBy.push(use);
        continue;
      }
      entry.setBy.push(use);
      entry.nodeTypes = [...new Set([...entry.nodeTypes, ...use.nodeTypes])];
    }
  }
  return usage;
};

/** The node types that a stage setting `layoutId` places. */
export const getNodeTypesWithLayout = (
  protocol: LayoutProtocol,
  layoutId: string,
): readonly string[] => getLayoutUsage(protocol)[layoutId]?.nodeTypes ?? [];

/** The layouts a stage sets for nodes of `nodeType`. */
export const getLayoutsOfNodeType = (
  protocol: LayoutProtocol,
  nodeType: string,
): readonly string[] =>
  Object.entries(getLayoutUsage(protocol)).flatMap(([layoutId, entry]) =>
    entry.nodeTypes.includes(nodeType) ? [layoutId] : [],
  );

/**
 * Each stage use that reads a layout for node types no stage sets it for:
 * nodes of those types can never have a position there.
 */
export const findUnreachableLayoutReads = (
  protocol: LayoutProtocol,
): Array<{
  stageId: string;
  presetId?: string;
  layoutId: string;
  nodeTypes: readonly string[];
}> => {
  const usage = getLayoutUsage(protocol);
  return Object.entries(usage).flatMap(([layoutId, entry]) =>
    entry.readBy.flatMap((use) => {
      const nodeTypes = use.nodeTypes.filter(
        (type) => !entry.nodeTypes.includes(type),
      );
      return nodeTypes.length === 0
        ? []
        : [
            {
              stageId: use.stageId,
              ...(use.presetId === undefined ? {} : { presetId: use.presetId }),
              layoutId,
              nodeTypes,
            },
          ];
    }),
  );
};

/** Whether no stage before `stageId` names `layoutId`. */
export const isFirstStageUsingLayout = (
  protocol: LayoutProtocol,
  stageId: string,
  layoutId: string,
): boolean => {
  for (const stage of protocol.stages) {
    if (stage.id === stageId) return true;
    if (getStageLayoutUses(stage).some((use) => use.layoutId === layoutId)) {
      return false;
    }
  }
  return false;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Every node rule of a stage (its filter, skip logic, panel filters and
 * conditions) whose attribute is `layoutId`, with the path of the rule's
 * attribute. A rule naming a layout is a use of it, as a rule naming a
 * variable is a use of the variable.
 */
export const findRulesNamingLayout = (
  protocol: unknown,
  layoutId: string,
): Array<{ stageId: string; path: (string | number)[] }> => {
  if (!isRecord(protocol) || !Array.isArray(protocol.stages)) return [];
  const stages: unknown[] = protocol.stages;
  return collectEntityAttributeReferences(protocol).flatMap((hit) => {
    const { path } = hit;
    if (
      hit.variableId !== layoutId ||
      hit.subject !== undefined ||
      path[0] !== 'stages' ||
      path.at(-1) !== 'attribute' ||
      path.at(-2) !== 'options'
    ) {
      return [];
    }
    const rule = valueAt(protocol, path.slice(0, -2));
    if (!isRecord(rule) || rule.type !== 'node') return [];
    const stage = stages[Number(path[1])];
    const stageId = isRecord(stage) ? stage.id : undefined;
    return typeof stageId === 'string' ? [{ stageId, path }] : [];
  });
};
