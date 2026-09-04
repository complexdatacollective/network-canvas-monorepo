import type { ProtocolStage } from './protocolStages.ts';
import type { StageSummary } from './stageTypes.ts';

export const SYNC_COMMAND = 'pnpm --filter networkcanvas.com gallery:sync';

export const WAVES_COLUMN = 'Waves';

const PROTOCOL_ASSET_COLUMN = 'Protocol File (asset)';
const CODEBOOK_ASSET_COLUMN = 'Codebook Summary (asset)';
const protocolAssetWavePattern = /^Protocol File \(asset\) Wave (\d+)$/;
const derivedWavePattern =
  /^(?:Schema Version|Stage Count|Edge Stages|Stages) Wave \d+$/;

function waveSuffix(wave: number): string {
  return wave === 1 ? '' : ` Wave ${wave}`;
}

export function protocolAssetColumn(wave: number): string {
  return `${PROTOCOL_ASSET_COLUMN}${waveSuffix(wave)}`;
}

export function codebookAssetColumn(wave: number): string {
  return `${CODEBOOK_ASSET_COLUMN}${waveSuffix(wave)}`;
}

export function schemaVersionColumn(wave: number): string {
  return `Schema Version Wave ${wave}`;
}

export function stageCountColumn(wave: number): string {
  return `Stage Count Wave ${wave}`;
}

export function edgeStagesColumn(wave: number): string {
  return `Edge Stages Wave ${wave}`;
}

export function stagesColumn(wave: number): string {
  return `Stages Wave ${wave}`;
}

export function derivedColumns(waves: readonly number[]): string[] {
  return [
    WAVES_COLUMN,
    ...waves.map(schemaVersionColumn),
    ...waves.map(stageCountColumn),
    ...waves.map(edgeStagesColumn),
    ...waves.map(stagesColumn),
  ];
}

export function isDerivedColumn(column: string): boolean {
  return column === WAVES_COLUMN || derivedWavePattern.test(column);
}

export function discoverWaves(header: readonly string[]): number[] {
  const waves = new Set<number>([1]);
  for (const column of header) {
    const wave = protocolAssetWavePattern.exec(column)?.[1];
    if (wave) waves.add(Number(wave));
  }
  return [...waves].toSorted((a, b) => a - b);
}

export function serializeStages(stages: readonly ProtocolStage[]): string {
  return JSON.stringify(stages.map(({ type, label }) => ({ type, label })));
}

export function serializeEdgeStages(summary: StageSummary): string {
  return summary.edgeCounts
    .map(({ type, count }) => `${type}=${count}`)
    .join(';');
}
