import type { ConstraintConflict } from '@codaco/protocol-utilities';
import {
  type CurrentProtocol,
  defaultNodeCount,
  type EdgeTopology,
  type Stage,
  topologyDrawWindow,
} from '@codaco/protocol-validation';
import { conflictsForStage } from '~/components/Synthetic/conflicts';
import {
  formatEdgeTopology,
  formatProbability,
  formatResponseBurden,
  formatSyntheticCount,
  type SyntheticWindow,
} from '~/components/Synthetic/summaries';

import {
  declares,
  isRecord,
  readNumber,
  recordAt,
  recordsAt,
  type UnknownRecord,
} from './documentReaders';

/**
 * The stage half of the read-only overview (spec, Surfaces §4): one row per
 * stage in timeline order, carrying every synthetic parameter that stage
 * resolves, whether each was authored or defaulted, the panels hanging off it,
 * and the conflicts the feasibility gate laid at its door.
 *
 * Two inputs, deliberately: the PARSED protocol supplies the effective values
 * (the schema's prefaults, defaults and transforms are what resolve them, so a
 * row can never disagree with what generation would do), and the SAVED
 * DOCUMENT answers which keys a human actually wrote. Neither can answer the
 * other's question.
 */

export type ResolvedParameter = {
  /** The effective value, formatted by the shared summary formatters. */
  value: string;
  /** True when the saved document states the key (spec rule 4). */
  authored: boolean;
};

export type SyntheticPanelRow = {
  id: string;
  title: string;
  nominationProbability: ResolvedParameter;
};

export type SyntheticStageRow = {
  id: string;
  /** Timeline position, 1-based, as the researcher counts stages. */
  position: number;
  label: string;
  type: string;
  count: ResolvedParameter | undefined;
  topology: ResolvedParameter | undefined;
  responseBurden: ResolvedParameter;
  /**
   * Why a parameter this stage type can carry is not shown — the Sociogram
   * nuance (spec, Surfaces §1): a stage whose prompts create no edges never
   * consults its topology, so showing one would describe work it does not do.
   */
  note: string | undefined;
  panels: SyntheticPanelRow[];
  conflicts: ConstraintConflict[];
};

const NO_EDGE_PROMPTS_NOTE =
  'No prompt on this stage creates edges, so its edge topology is never used.';

/**
 * A metric's own domain, asked of the schema rather than restated.
 *
 * `topologyDrawWindow` narrows a metric's domain by whatever bounds the
 * declaration states, and a `constant` states none — so the window it returns
 * for one IS the domain. Passed to the formatter as the field's valid window,
 * which is what lets a declared bound that merely repeats an endpoint (0 and 1
 * on a density) drop out while a bound that genuinely narrows still shows.
 */
const metricDomain = (metric: EdgeTopology['metric']): SyntheticWindow =>
  topologyDrawWindow(
    metric === 'density'
      ? {
          metric: 'density',
          distribution: { distribution: 'constant', value: 0 },
        }
      : {
          metric: 'meanDegree',
          distribution: { distribution: 'constant', value: 0 },
        },
  );

/** The node-count window this stage resolves its count inside. */
const countWindow = (stage: Stage): SyntheticWindow | undefined => {
  // Read structurally: `behaviours` is a different shape on every interface
  // that has one (a canvas's is nothing like a name generator's), and only the
  // node-count pair is the count's business.
  const declared = 'behaviours' in stage ? stage.behaviours : undefined;
  const behaviours = isRecord(declared) ? declared : undefined;
  const minNodes = readNumber(behaviours, 'minNodes');
  const maxNodes = readNumber(behaviours, 'maxNodes');
  // Asked of the schema's own default rather than recomputed: `defaultNodeCount`
  // resolves the count a stage that declares none is read as having, and its
  // bounds ARE that stage's resolution window — the stage's `behaviours` held
  // inside the population ceiling.
  const resolved = defaultNodeCount({ minNodes, maxNodes });
  // Narrowed rather than assumed: `defaultNodeCount` is typed as the whole
  // count union, and a family that pins its own support (a `constant`) states
  // no bounds to read a window from. Today it always answers `normal`; should
  // that change, this reports "no window" and every declared bound is shown,
  // which is the safe direction to be wrong in.
  if (resolved.distribution !== 'normal') return undefined;
  const { min, max } = resolved;
  return min === undefined || max === undefined ? undefined : { min, max };
};

/**
 * Whether this stage's topology can take effect.
 *
 * Only a Sociogram can declare one and then create no edges: its prompts opt
 * into edge creation individually, while every other edge-creating interface
 * names an edge type on every prompt.
 */
const topologyApplies = (stage: Stage): boolean =>
  stage.type !== 'Sociogram' ||
  stage.prompts.some((prompt) => prompt.edges?.create !== undefined);

const panelRows = (
  stage: Stage,
  documentStage: UnknownRecord | undefined,
): SyntheticPanelRow[] => {
  if (!('panels' in stage) || stage.panels === undefined) return [];
  const documentPanels = recordsAt(documentStage, 'panels');

  return stage.panels.flatMap((panel, index) => {
    // Only an existing-network panel resolves nomination odds; the schema
    // refuses them anywhere else, so a roster panel has no parameter to show.
    const probability = panel.synthetic?.nominationProbability;
    if (probability === undefined) return [];
    return [
      {
        id: panel.id,
        title: panel.title,
        nominationProbability: {
          value: formatProbability(probability),
          authored: declares(
            recordAt(documentPanels[index], 'synthetic'),
            'nominationProbability',
          ),
        },
      },
    ];
  });
};

export const buildStageRows = (
  protocol: CurrentProtocol,
  document: unknown,
  conflicts: readonly ConstraintConflict[],
): SyntheticStageRow[] => {
  const documentStages = recordsAt(
    isRecord(document) ? document : undefined,
    'stages',
  );

  return protocol.stages.map((stage, index) => {
    // Paired by position: a parse neither reorders stages nor adds or drops
    // one, so index is the only correspondence there is (a stage id is not
    // required to be unique across a mid-edit document).
    const documentStage = documentStages[index];
    const documentSynthetic = recordAt(documentStage, 'synthetic');
    const { synthetic } = stage;

    const count = 'count' in synthetic ? synthetic.count : undefined;
    const topology =
      'topology' in synthetic && topologyApplies(stage)
        ? synthetic.topology
        : undefined;

    const countBounds = countWindow(stage);
    return {
      id: stage.id,
      position: index + 1,
      label: stage.label,
      type: stage.type,
      count:
        count === undefined
          ? undefined
          : {
              value: formatSyntheticCount(count, { window: countBounds }),
              authored: declares(documentSynthetic, 'count'),
            },
      topology:
        topology === undefined
          ? undefined
          : {
              value: formatEdgeTopology(topology, {
                window: metricDomain(topology.metric),
              }),
              authored: declares(documentSynthetic, 'topology'),
            },
      responseBurden: {
        value: formatResponseBurden(synthetic.responseBurden),
        authored: declares(documentSynthetic, 'responseBurden'),
      },
      note:
        'topology' in synthetic && !topologyApplies(stage)
          ? NO_EDGE_PROMPTS_NOTE
          : undefined,
      panels: panelRows(stage, documentStage),
      conflicts: conflictsForStage(conflicts, stage.id),
    };
  });
};
