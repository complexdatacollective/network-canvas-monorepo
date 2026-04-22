# Protocol redesign — implementation notes

## Pre-flight

- Stage deep-link: supported (client-side URL construction in `uploadProtocolForPreview`)
  Evidence: in `apps/architect-vite/src/utils/preview/uploadPreview.ts`, both the `ready` and `complete` branches mutate the server-returned `previewUrl` client-side when `stageIndex > 0`:
  ```ts
  if (stageIndex > 0) {
      const url = new URL(completeResponse.previewUrl);
      url.searchParams.set("step", stageIndex.toString());
      return { ...completeResponse, previewUrl: url.toString() };
  }
  ```
  The server returns a base `previewUrl`; the architect appends `?step=<stageIndex>` to deep-link into the specified stage. The Interviewer (Fresco) is expected to honor the `step` query param.
- `ProtocolControlBar` consumers:
  - `apps/architect-vite/src/components/Protocol.tsx` (production consumer — renders `<ProtocolControlBar />`)
  - `apps/architect-vite/src/components/__tests__/ProtocolControlBar.test.tsx` (unit test)
  - `apps/architect-vite/src/components/__tests__/Protocol.test.tsx` (mocks `~/components/ProtocolControlBar` via `vi.mock`)
  - Stale snapshot files also reference it: `__snapshots__/ProtocolControlBar.test.tsx.snap`, `ProtocolControlBar.test.js.snap`, `ProtocolControlBar.test.jsx.snap` (snapshots only — not runtime consumers)
  - Definition site: `apps/architect-vite/src/components/ProtocolControlBar.tsx`
- StageEditor `ControlBar` usages: single block in `apps/architect-vite/src/components/StageEditor/StageEditor.tsx` — imports `ControlBar` from `~/components/ControlBar` and renders `<ControlBar ... />` once. No divergences.
- Manual route-render sanity check: deferred to human pre-flight (dev server required). A human should run `pnpm --filter architect-vite dev` and verify all six protocol-editor routes render before Task 1 begins.
