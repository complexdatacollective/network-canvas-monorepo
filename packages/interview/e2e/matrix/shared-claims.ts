/**
 * Option-inventory keys satisfied by shared coverage rather than per-interface
 * scenarios. `skipLogic` and `filter` have two-part backing:
 *
 * 1. SCHEMA support (per interface): whether a stage type can carry a
 *    stage-level `skipLogic` / `filter` at all is a schema question, and it is
 *    NOT uniform — `skipLogic` lives on `baseStageSchema` so every authorable
 *    stage but the finish stage accepts it, but `filter` is declared only by
 *    the ten stage schemas listed below. `stage-config-schema-support.test.ts` builds each interface's
 *    stage config and re-parses it against the `stageSchema` union with each key
 *    injected, asserting acceptance exactly matches the schema — so every claim
 *    here is proven schema-valid per interface, and a bogus claim (e.g. a
 *    `FinishSession:skipLogic`, which the finish stage schema refuses) fails
 *    the test.
 * 2. RUNTIME behaviour (shared, type-agnostic): the Shell's skip decision
 *    (`getSkipMap` in src/selectors/skip-logic.ts) reads `stage.skipLogic` by
 *    index without regard to `stage.type` (the type only decides whether a
 *    form or census stage with nothing to ask about is passed, which each of
 *    those suites covers with its own empty-network scenario), and stage
 *    `filter` is applied by
 *    shared network selectors before any interface renders. The cross-cutting
 *    suite proves that machinery exhaustively — both skip actions (SKIP/SHOW),
 *    every Filter operator, and a stage `filter` scoping the rendered node set
 *    without mutating the stored network.
 *
 * Together these back each claim without 20 redundant per-interface e2e
 * navigation scenarios (which would only re-exercise the type-agnostic runtime
 * path once per interface).
 */
/**
 * `dynamicValues` is shared the same way for every interface without a
 * scenario of its own: the Shell gives every stage its values
 * (`StageDynamicValues` in src/Shell.tsx) and every piece of protocol text
 * resolves them through the one text resolver, whatever the stage's type. The
 * EgoForm, Information and DyadCensus suites prove that path end to end (a
 * form's live answers, a value carried to a later stage and kept literal, a
 * census pair's own names); the interfaces below reuse it unchanged.
 * OneToManyDyadCensus is not among them: its focal person is put on screen
 * by its own wiring, which its suite proves.
 */
const dynamicValuesClaims = [
  'AlterEdgeForm',
  'AlterForm',
  'Anonymisation',
  'CategoricalBin',
  'FamilyPedigree',
  'FinishSession',
  'Geospatial',
  'NameGenerator',
  'NameGeneratorQuickAdd',
  'NameGeneratorRoster',
  'Narrative',
  'NarrativePedigree',
  'NetworkComposer',
  'OrdinalBin',
  'Sociogram',
  'TieStrengthCensus',
].map((iface) => `${iface}:dynamicValues`);

export const sharedSuiteClaims: readonly string[] = [
  ...dynamicValuesClaims,
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
