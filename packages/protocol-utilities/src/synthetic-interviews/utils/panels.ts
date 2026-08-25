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
 * Apply an existing-network panel's filter with the semantics the runtime's
 * panel selector uses: candidates are filtered against the REAL network —
 * edges and ego included — so an ego- or edge-scoped rule reads the session
 * as it stands (`getPanelNodes`' existing branch). Roster panels never come
 * here: their filters were applied host-side over a flat candidate list.
 */
const applyPanelFilter = (
  nodes: NcNode[],
  network: NcNetwork,
  panelFilter?: Filter,
): NcNode[] => {
  if (!panelFilter) return nodes;

  return buildFilter(panelFilter)({
    nodes,
    edges: network.edges,
    ego: network.ego ?? {
      [entityPrimaryKeyProperty]: '',
      [entityAttributesProperty]: {},
    },
  }).nodes;
};

/**
 * The roster rows a stage would be DISPLAYING, given what the network already
 * holds.
 *
 * Taken by stage id rather than by the stage: NameGeneratorRoster draws its
 * whole population from a roster while the two name generators reach one
 * through a panel, and what the participant can still see of it is the same
 * question for all three.
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
  stageId: string,
  assetData: AssetData,
  network: NcNetwork,
): NcNode[] => {
  const pool = assetData.rosterNodes?.[stageId] ?? [];
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

  return applyPanelFilter(candidates, network, panel.filter);
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
  const available = displayedRosterNodes(stage.id, assetData, network).length;

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
 * Offer a stage's roster rows one at a time until `wanted` have been
 * nominated, or the list runs out. Answers how many were taken.
 *
 * ONE at a time rather than a slate chosen up front, because taking a row
 * changes what the next one may be: its values are in the network the moment
 * it is added, so a second row carrying the same `unique` value is no longer a
 * row this session can use. A roster is the researcher's own data, and nothing
 * stops two of its rows offering one value for a variable the codebook marks
 * `unique` — choosing the whole set before any of it lands is what would let
 * both through.
 *
 * `nominate` answers whether the row was actually taken; a row passed over
 * does not spend the stage's count, and the next candidate is offered instead.
 * It belongs to the caller because taking a row is a WRITE, and only the
 * caller holds the engine and the unique registry.
 *
 * `chooseIndex` is how this participant reaches into the list. A name
 * generator's roster panel sits beside a text field and gets worked down, so
 * it takes the front; a NameGeneratorRoster IS the list — searchable,
 * sortable, shown in whatever order was asked for — so it draws uniformly.
 *
 * The list is derived against the network as it stands when the offering
 * starts, and each row offered leaves it, so nobody is offered twice and
 * people nominated on an earlier prompt are gone already.
 */
export const nominateFromRoster = ({
  stageId,
  assetData,
  network,
  wanted,
  chooseIndex,
  nominate,
}: {
  stageId: string;
  assetData: AssetData;
  network: NcNetwork;
  wanted: number;
  chooseIndex: (remaining: readonly NcNode[]) => number;
  nominate: (row: NcNode) => boolean;
}): number => {
  const remaining = displayedRosterNodes(stageId, assetData, network);
  let taken = 0;

  while (taken < wanted && remaining.length > 0) {
    const [row] = remaining.splice(chooseIndex(remaining), 1);
    if (row && nominate(row)) taken += 1;
  }

  return taken;
};
