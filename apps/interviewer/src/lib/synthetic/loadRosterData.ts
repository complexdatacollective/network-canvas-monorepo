import {
  getVariableTypeReplacements,
  loadExternalData,
  makeVariableUUIDReplacer,
} from '@codaco/interview';
import { filter as customFilter } from '@codaco/network-query';
import type { Filter, Stage } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';
import { getProtocolAssets } from '~/lib/db/api';
import type { StoredAsset, StoredProtocol } from '~/lib/db/types';

type RosterSource = {
  assetId: string;
  filter?: Filter;
};

type RosterStage = {
  stageId: string;
  subjectType: string;
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

  return { stageId: stage.id, subjectType: stage.subject.type, sources };
}

function applyPanelFilter(nodes: NcNode[], panelFilter?: Filter): NcNode[] {
  if (!panelFilter) return nodes;
  return customFilter(panelFilter)({
    nodes,
    edges: [],
    ego: { [entityPrimaryKeyProperty]: '', [entityAttributesProperty]: {} },
  }).nodes;
}

async function parseAsset(
  asset: StoredAsset,
  source: string | undefined,
  subjectType: string,
  codebook: StoredProtocol['codebook'],
): Promise<NcNode[]> {
  if (typeof asset.data === 'string') return [];

  const url = URL.createObjectURL(asset.data);
  try {
    const sourceFileName = source ?? asset.name;
    const { nodes } = await loadExternalData(sourceFileName, url);
    const uuidData = nodes.map(makeVariableUUIDReplacer(codebook, subjectType));
    return getVariableTypeReplacements(sourceFileName, uuidData, codebook, {
      entity: 'node',
      type: subjectType,
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function loadRosterNodesForStages(
  protocol: StoredProtocol,
): Promise<Record<string, NcNode[]>> {
  const rosterStages = protocol.protocol.stages
    .map(getRosterStage)
    .filter((s): s is RosterStage => s !== null);

  if (rosterStages.length === 0) return {};

  const records = await getProtocolAssets(protocol.hash).catch((e: unknown) => {
    // eslint-disable-next-line no-console
    console.error('Could not read protocol assets for roster data', e);
    return [];
  });
  const assetsById = new Map(records.map((r) => [r.assetId, r]));
  const manifest = protocol.protocol.assetManifest;

  const parseCache = new Map<string, Promise<NcNode[]>>();

  const result: Record<string, NcNode[]> = {};

  for (const { stageId, subjectType, sources } of rosterStages) {
    const byPrimaryKey = new Map<string, NcNode>();

    for (const { assetId, filter: panelFilter } of sources) {
      const asset = assetsById.get(assetId);
      if (!asset || asset.type !== 'network') continue;

      const cacheKey = `${assetId}::${subjectType}`;
      let parsed = parseCache.get(cacheKey);
      if (!parsed) {
        const manifestEntry = manifest?.[assetId];
        const source =
          manifestEntry && 'source' in manifestEntry
            ? manifestEntry.source
            : undefined;
        parsed = parseAsset(
          asset,
          source,
          subjectType,
          protocol.codebook,
        ).catch((e: unknown) => {
          // eslint-disable-next-line no-console
          console.error(`Could not read roster asset "${assetId}"`, e);
          return [];
        });
        parseCache.set(cacheKey, parsed);
      }

      for (const node of applyPanelFilter(await parsed, panelFilter)) {
        byPrimaryKey.set(node[entityPrimaryKeyProperty], node);
      }
    }

    if (byPrimaryKey.size > 0) result[stageId] = [...byPrimaryKey.values()];
  }

  return result;
}
