import type { NcNetwork, StageMetadata } from '@codaco/shared-consts';

// Ambient augmentation for the Redux store Shell.tsx:296 exposes on `window` in
// e2e mode (flags.isE2E — see the e2e host's App.tsx). Kept in a `.d.ts` so the
// e2e tsconfig gets the typing without importing the app's `~/`-aliased store
// module graph, and so declaration merging can use `interface` (the
// consistent-type-definitions rule does not fire in `.d.ts` files). Only
// DyadCensus's per-prompt answers (session.stageMetadata) are read here — they
// never surface via `window.__test.getNetworkState()`.
// The top-level `import type` above makes this file a module, so `declare
// global` augments the global scope rather than replacing it.
declare global {
  interface Window {
    __interviewStore?: {
      // Structural superset: network is included so programs that see BOTH
      // this declaration and src/vite-env.d.ts's (testHooks reads
      // session.network) resolve every access, whichever wins the merge.
      getState: () => {
        session: { network: NcNetwork; stageMetadata?: StageMetadata };
      };
    };
  }
}
