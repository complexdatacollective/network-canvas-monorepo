/**
 * Option-inventory keys satisfied by the shared cross-cutting suites
 * (cross-cutting.scenarios.ts) rather than per-interface scenarios. Every
 * entry MUST be backed by a generated wiring scenario — the coverage
 * manifest asserts the correspondence.
 */
export const sharedSuiteClaims: readonly string[] = [
  'Information:skipLogic',
  'NameGeneratorQuickAdd:skipLogic',
  'NameGeneratorQuickAdd:panels[].filter',
];
