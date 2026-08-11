import { oc } from '@orpc/contract';

import { MeSchema, StatusSchema } from './schemas.ts';

// The SPA's internal RPC contract (oRPC v2, per the 2026-08-10 decision on
// #1244). This is the only shared code between the two Studio deployables —
// the leaf of the client/server package diamond (#1244, 2026-08-11) — so it
// changes exactly when the API boundary changes, and release CI re-gates a
// half only when its boundary moved.
//
// This surface is deliberately separate from the public data API (#1248,
// 2026-08-11): procedures here are view/workflow-shaped for app screens,
// unpublished, and free-moving within the deploy-compatibility rules on
// #1245. The public API's contract lives inside the server, its only
// consumer in this repo.
//
// Node loads this package's source directly in development (the server runs
// under `node --watch`), so relative imports carry explicit `.ts` extensions.

export const contract = {
  status: oc.output(StatusSchema),
  /** The signed-in researcher; refuses UNAUTHORIZED without a session. */
  me: oc.output(MeSchema),
};
