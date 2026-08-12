/**
 * Option-inventory keys satisfied by shared coverage rather than per-interface
 * scenarios. `skipLogic` and `filter` have two-part backing:
 *
 * 1. SCHEMA support (per interface): whether a stage type can carry a
 *    stage-level `skipLogic` / `filter` at all is a schema question, and it is
 *    NOT uniform — `skipLogic` lives on `baseStageSchema` so every authorable
 *    stage accepts it, but `filter` is declared only by the ten stage schemas
 *    listed below. `stage-config-schema-support.test.ts` builds each interface's
 *    stage config and re-parses it against the `stageSchema` union with each key
 *    injected, asserting acceptance exactly matches the schema — so every claim
 *    here is proven schema-valid per interface, and a bogus claim (e.g. the
 *    former `FinishSession:skipLogic`, on a non-authorable engine-appended
 *    stage) fails the test.
 * 2. RUNTIME behaviour (shared, type-agnostic): the Shell's skip decision
 *    (`getSkipMap` in src/selectors/skip-logic.ts) reads `stage.skipLogic` by
 *    index and never inspects `stage.type`, and stage `filter` is applied by
 *    shared network selectors before any interface renders. The cross-cutting
 *    suite proves that machinery exhaustively — both skip actions (SKIP/SHOW),
 *    every Filter operator, and a stage `filter` scoping the rendered node set
 *    without mutating the stored network.
 *
 * Together these back each claim without 20 redundant per-interface e2e
 * navigation scenarios (which would only re-exercise the type-agnostic runtime
 * path once per interface).
 *
 * `synthetic` is claimed here for a different reason: it is authoring metadata
 * describing what GENERATED sample data should look like, and the interview
 * runtime never reads it. There is no participant-visible behaviour for a
 * scenario to exercise, and its own rules are covered by the schema tests in
 * protocol-validation and the generator tests in protocol-utilities. It is
 * inventoried so the schema walk stays exhaustive, and claimed here so that
 * exhaustiveness does not demand an e2e scenario for a key with nothing to
 * show.
 */
export const sharedSuiteClaims: readonly string[] = [
  'NameGenerator:synthetic',
  'NameGeneratorQuickAdd:synthetic',
  'NameGeneratorRoster:synthetic',
  'NetworkComposer:synthetic',
  'Sociogram:synthetic',
  'DyadCensus:synthetic',
  'OneToManyDyadCensus:synthetic',
  'TieStrengthCensus:synthetic',
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
