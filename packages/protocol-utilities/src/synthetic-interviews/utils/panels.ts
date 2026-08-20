import { filter as buildFilter } from '@codaco/network-query';
import type { Filter, Panel, Stage } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNetwork,
  type NcNode,
} from '@codaco/shared-consts';

import type { SessionStreams } from '../session-engine/streams';
import type { AssetData } from '../simulators/types';

type NameGeneratorStage = Extract<
  Stage,
  { type: 'NameGenerator' | 'NameGeneratorQuickAdd' }
>;

/**
 * The share of a stage's nominations a participant takes from a roster rather
 * than typing in themselves, drawn per stage.
 *
 * Drawn rather than fixed because the balance is a property of the session,
 * not the protocol: one participant works down the roster, the next mostly
 * names people who are not on it. Uniform over the whole range, so both
 * extremes appear.
 */
const drawRosterShare = (
  budget: number,
  available: number,
  streams: SessionStreams,
): number => streams.int('coins', 0, Math.min(budget, available));

const uidOf = (node: NcNode): string => node[entityPrimaryKeyProperty];

/**
 * Apply a panel's filter with the semantics the runtime's panel selector uses.
 *
 * The ego stands in for a real one so ego-scoped rules have something to read;
 * edges are excluded because a panel filters a flat list of candidates, not a
 * connected network.
 */
const applyPanelFilter = (nodes: NcNode[], panelFilter?: Filter): NcNode[] => {
  if (!panelFilter) return nodes;

  return buildFilter(panelFilter)({
    nodes,
    edges: [],
    ego: { [entityPrimaryKeyProperty]: '', [entityAttributesProperty]: {} },
  }).nodes;
};

/**
 * The roster rows this stage's panels would be DISPLAYING, given what the
 * network already holds.
 *
 * The pool is the host's, keyed by STAGE id: `collectRosterExternalData` has
 * already fetched each panel's asset, applied that panel's own filter, pooled
 * the panels in stage order and deduplicated by primary key, so what arrives
 * here is one ordered list of candidates for the stage. Re-filtering it panel
 * by panel is impossible and would be wrong — a row admitted by one panel's
 * filter need not satisfy another's — and inventing rows for an absent key is
 * exactly the fabrication the roster contract removed: a key that never
 * resolved is an empty pool, and an empty pool nominates nobody.
 *
 * What is still decided here is what the participant can see: a name generator
 * hides a roster row once that person is in the interview network, because
 * they have already been named and offering them again would invite a
 * duplicate the interface cannot create. Exclusion is by `_uid`, because that
 * is what makes it work at runtime — a roster row keeps its own id when it is
 * added to the network, so its presence there is detectable.
 */
const displayedRosterNodes = (
  stage: NameGeneratorStage,
  assetData: AssetData,
  network: NcNetwork,
): NcNode[] => {
  const pool = assetData.rosterNodes?.[stage.id] ?? [];
  if (pool.length === 0) return [];

  const inNetwork = new Set(network.nodes.map(uidOf));
  return pool.filter((row) => !inNetwork.has(uidOf(row)));
};

/**
 * The network members an existing-network panel would be DISPLAYING for the
 * prompt now on screen.
 *
 * Scoped to the stage's own subject, because a panel offers candidates for the
 * node type this stage collects. Nodes already nominated on this prompt are
 * excluded — the panel exists to move people ONTO the current prompt, and one
 * already there is not a candidate.
 */
const displayedExistingNodes = (
  panel: Panel,
  network: NcNetwork,
  subjectType: string,
  promptId: string,
): NcNode[] => {
  if (panel.dataSource !== 'existing') return [];

  const candidates = network.nodes.filter(
    (node) =>
      node.type === subjectType && !(node.promptIDs ?? []).includes(promptId),
  );

  return applyPanelFilter(candidates, panel.filter);
};

/**
 * How a stage's nominations divide between people the participant types in and
 * people they take from a roster.
 *
 * The roster's share is capped by what its panels are actually displaying: a
 * roster of four cannot supply five nominations however large the stage's
 * count, and the remainder falls back to typed-in people rather than being
 * lost. A stage whose roster resolved to nothing puts its whole budget into
 * new nodes.
 */
export const splitNominationBudget = (
  budget: number,
  stage: NameGeneratorStage,
  assetData: AssetData,
  network: NcNetwork,
  streams: SessionStreams,
): { newNodes: number; fromRoster: number } => {
  const available = displayedRosterNodes(stage, assetData, network).length;

  if (available === 0) return { newNodes: budget, fromRoster: 0 };

  const fromRoster = drawRosterShare(budget, available, streams);
  return { newNodes: budget - fromRoster, fromRoster };
};

/**
 * Decide, per candidate, whether the participant drags them from an
 * existing-network panel onto the current prompt.
 *
 * The odds come from the panel, because a panel is a question: "people you
 * named earlier" and "people you said you were close to" invite the same
 * person back at very different rates, and the author is the one who knows
 * which is which.
 */
export const nominationsFromExistingPanels = (
  stage: NameGeneratorStage,
  network: NcNetwork,
  promptId: string,
  streams: SessionStreams,
): NcNode[] => {
  const chosen = new Map<string, NcNode>();
  const decided = new Set<string>();

  for (const panel of stage.panels ?? []) {
    // Nomination odds are resolved onto existing-network panels alone: the
    // schema supplies the default there and refuses the field on a roster
    // panel, whose share of the stage is drawn once rather than person by
    // person. So a panel carrying no odds is a panel this function has
    // nothing to say about — exactly the set `displayedExistingNodes` returns
    // nothing for — and skipping it is a guard, not a fallback.
    const nominationProbability = panel.synthetic?.nominationProbability;
    if (nominationProbability === undefined) continue;

    for (const node of displayedExistingNodes(
      panel,
      network,
      stage.subject.type,
      promptId,
    )) {
      // A person shown by two panels is still one person, and the participant
      // decides about them once. The FIRST panel in stage order that displays
      // them is the one whose odds apply: it is the panel they meet first,
      // and by the time a later panel offers the same face the participant
      // has already made their mind up about it.
      //
      // Tracked apart from `chosen`, because declining is a decision too.
      // Keying the skip on `chosen` alone would let a second panel re-roll
      // everyone the first turned down, so a panel at 0 placed after a panel
      // at 0.9 would take back almost everybody — the opposite of what its
      // author asked for.
      if (decided.has(uidOf(node))) continue;
      decided.add(uidOf(node));
      if (streams.draw('coins') < nominationProbability) {
        chosen.set(uidOf(node), node);
      }
    }
  }

  return [...chosen.values()];
};

/**
 * Take up to `wanted` people from the stage's roster pool, in pool order.
 *
 * Re-derived against the network on every call rather than from a pool taken
 * once, so a person nominated on an earlier prompt has already disappeared
 * from the roster by the time the next prompt draws — which is what the
 * interface shows the participant.
 *
 * `isDrawable` passes over a row the session cannot use — one whose `unique`
 * values the network already holds. The predicate is the caller's because it
 * reads the unique registry, which a panel knows nothing about.
 */
export const takeFromRoster = (
  wanted: number,
  stage: NameGeneratorStage,
  assetData: AssetData,
  network: NcNetwork,
  isDrawable: (row: NcNode) => boolean,
): NcNode[] => {
  const taken: NcNode[] = [];

  for (const row of displayedRosterNodes(stage, assetData, network)) {
    if (taken.length >= wanted) break;
    if (!isDrawable(row)) continue;
    taken.push(row);
  }

  return taken;
};
