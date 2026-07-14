/**
 * Option-inventory keys satisfied by the shared cross-cutting suite
 * (cross-cutting.scenarios.ts) rather than per-interface scenarios.
 *
 * `skipLogic` and `filter` are engine-level: the Shell decides whether to
 * render a stage from its `skipLogic`, and shared network selectors apply a
 * stage `filter` before any interface renders — the same code path regardless
 * of stage type. The cross-cutting suite proves that machinery exhaustively:
 * both skip actions (SKIP/SHOW) and every Filter operator drive skips
 * correctly, and a stage `filter` scopes the rendered node set without
 * mutating the stored network. These claims are therefore backed by that
 * shared mechanism coverage, not blanket-declared. (Per-interface wiring
 * scenarios were considered but omitted: they re-exercise the identical
 * engine path once per interface and prove nothing the operator matrix does
 * not.)
 */
export const sharedSuiteClaims: readonly string[] = [
  'AlterEdgeForm:skipLogic',
  'AlterEdgeForm:filter',
  'Anonymisation:skipLogic',
  'AlterForm:skipLogic',
  'AlterForm:filter',
  'CategoricalBin:skipLogic',
  'CategoricalBin:filter',
  'DyadCensus:skipLogic',
  'DyadCensus:filter',
  'EgoForm:skipLogic',
  'FamilyPedigree:skipLogic',
  'FinishSession:skipLogic',
  'Geospatial:skipLogic',
  'Geospatial:filter',
  'Information:skipLogic',
  'NameGenerator:skipLogic',
  // Claimed by the Anonymisation suite's end-to-end passphrase flow, which
  // exercises encrypted node variables through the NameGenerator form.
  'NameGenerator:codebook: variable.encrypted',
  'NameGeneratorQuickAdd:skipLogic',
  'NameGeneratorQuickAdd:panels[].filter',
  'NameGeneratorRoster:skipLogic',
  'Narrative:skipLogic',
  'NarrativePedigree:skipLogic',
  'NetworkComposer:skipLogic',
  'OneToManyDyadCensus:filter',
  'OneToManyDyadCensus:skipLogic',
  'OrdinalBin:skipLogic',
  'Sociogram:skipLogic',
  'Sociogram:filter',
  'TieStrengthCensus:filter',
  'TieStrengthCensus:skipLogic',
];
