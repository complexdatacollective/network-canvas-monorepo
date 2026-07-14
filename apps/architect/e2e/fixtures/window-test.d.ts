// Global augmentation so specs can read/write test-only properties on `window`
// without an `as` cast (mirrors packages/interview/e2e/fixtures/window-test.d.ts).
// This file has no imports/exports, so it is an ambient global script: a
// top-level `interface Window` merges directly into the DOM lib's global
// Window, no `declare global` wrapper needed. oxlint's
// consistent-type-definitions rule is disabled for *.d.ts (.oxlintrc.json), so
// `interface` (required for declaration merging) needs no inline override.
interface Window {
  // Set by the print-action spec's window.print stub
  // (specs/codebook-and-summary.spec.ts): records document.title at each
  // print() call so the test can assert the pdf-styled title was live while
  // printing, before usePrintProtocolAction restores it.
  __printTitles?: string[];
}
