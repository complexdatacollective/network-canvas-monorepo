import { filter as customFilter } from '@codaco/network-query';
import type {
  Codebook,
  Filter,
  Stage,
  StageSubject,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import { getVariableTypeReplacements } from '../utils/externalData';
import loadExternalData, {
  makeVariableUUIDReplacer,
} from '../utils/loadExternalData';

type NodeSubject = Extract<StageSubject, { entity: 'node' }>;

/**
 * A roster/panel asset resolved by the host: a fetchable URL, the filename
 * that drives the CSV-vs-JSON decision, and an optional cleanup callback
 * (e.g. `URL.revokeObjectURL`) invoked once parsing settles, whether it
 * succeeded or failed.
 */
export type ResolvedRosterAsset = {
  url: string;
  sourceFileName: string;
  cleanup?: () => void;
};

/**
 * Host hook resolving a protocol asset-manifest id to a fetchable asset.
 * Returns null when the asset is missing or isn't a network asset, in which
 * case that source is skipped.
 */
export type ResolveRosterAsset = (
  assetId: string,
) => Promise<ResolvedRosterAsset | null>;

/**
 * The runtime's external-data parse pipeline (single source of truth):
 * fetch → uuid-replace → type-replace. Mirrors `useExternalData`.
 *
 * `subject` accepts any non-ego stage subject (node or edge) because the
 * hook this backs (`useExternalData`) is typed against the shared
 * `getStageSubject` selector, which spans every stage type; in practice only
 * node subjects reach it, since only node-collecting stages (NameGenerator,
 * NameGeneratorRoster, NameGeneratorQuickAdd) carry external data sources.
 */
export async function parseExternalNetworkAsset({
  sourceFileName,
  url,
  codebook,
  subject,
}: {
  sourceFileName: string;
  url: string;
  codebook: Codebook;
  subject: Exclude<StageSubject, { entity: 'ego' }>;
}): Promise<NcNode[]> {
  const { nodes } = await loadExternalData(sourceFileName, url);
  const uuidData = nodes.map(makeVariableUUIDReplacer(codebook, subject.type));
  return getVariableTypeReplacements(
    sourceFileName,
    uuidData,
    codebook,
    subject,
  );
}

/**
 * The runtime's external-panel filter semantics (`getPanelNodes`, external
 * branch). `defaultEgo` deliberately mirrors that selector's shape exactly —
 * it stands in for a real ego so ego-scoped filter rules have something to
 * read, it is not meant to represent an actual participant.
 */
export function filterExternalPanelNodes(
  nodes: NcNode[],
  filter?: Filter,
): NcNode[] {
  if (!filter) {
    return nodes;
  }

  const defaultEgo = { _uid: '', [entityAttributesProperty]: {} };
  return customFilter(filter)({
    nodes,
    edges: [],
    ego: defaultEgo,
  }).nodes;
}

type RosterSource = {
  assetId: string;
  filter?: Filter;
};

type RosterStage = {
  stageId: string;
  subject: NodeSubject;
  sources: RosterSource[];
};

function getRosterStage(stage: Stage): RosterStage | null {
  const sources: RosterSource[] = [];

  if (stage.type === 'NameGeneratorRoster') {
    sources.push({ assetId: stage.dataSource });
  } else if (
    stage.type === 'NameGenerator' ||
    stage.type === 'NameGeneratorQuickAdd'
  ) {
    for (const panel of stage.panels ?? []) {
      if (panel.dataSource !== 'existing') {
        sources.push({ assetId: panel.dataSource, filter: panel.filter });
      }
    }
  } else {
    return null;
  }

  if (sources.length === 0) return null;
  if (stage.subject.entity !== 'node') return null;

  return { stageId: stage.id, subject: stage.subject, sources };
}

async function parseRosterSource(
  assetId: string,
  subject: NodeSubject,
  codebook: Codebook,
  resolveAsset: ResolveRosterAsset,
): Promise<NcNode[]> {
  const resolved = await resolveAsset(assetId);
  if (!resolved) {
    return [];
  }

  try {
    return await parseExternalNetworkAsset({
      sourceFileName: resolved.sourceFileName,
      url: resolved.url,
      codebook,
      subject,
    });
  } finally {
    resolved.cleanup?.();
  }
}

/**
 * Host-agnostic roster collection for synthetic generation: per-stage node
 * pools keyed by stage id, built from each stage's `NameGeneratorRoster`
 * data source, or `NameGenerator`/`NameGeneratorQuickAdd` panel data sources.
 */
export async function collectRosterExternalData({
  stages,
  codebook,
  resolveAsset,
}: {
  stages: Stage[];
  codebook: Codebook;
  resolveAsset: ResolveRosterAsset;
}): Promise<Record<string, NcNode[]>> {
  const rosterStages = stages
    .map(getRosterStage)
    .filter((stage): stage is RosterStage => stage !== null);

  if (rosterStages.length === 0) {
    return {};
  }

  // Cache parses per invocation so an asset shared by several stages (or
  // panels) is only fetched and parsed once per subject type.
  const parseCache = new Map<string, Promise<NcNode[]>>();
  const result: Record<string, NcNode[]> = {};

  for (const { stageId, subject, sources } of rosterStages) {
    const byPrimaryKey = new Map<string, NcNode>();

    for (const { assetId, filter } of sources) {
      const cacheKey = `${assetId}::${subject.type}`;
      let parsed = parseCache.get(cacheKey);
      if (!parsed) {
        parsed = parseRosterSource(
          assetId,
          subject,
          codebook,
          resolveAsset,
        ).catch((error: unknown) => {
          // eslint-disable-next-line no-console
          console.error(`Could not read roster asset "${assetId}"`, error);
          return [];
        });
        parseCache.set(cacheKey, parsed);
      }

      for (const node of filterExternalPanelNodes(await parsed, filter)) {
        byPrimaryKey.set(node[entityPrimaryKeyProperty], node);
      }
    }

    if (byPrimaryKey.size > 0) {
      result[stageId] = [...byPrimaryKey.values()];
    }
  }

  return result;
}
