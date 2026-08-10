import { oc } from '@orpc/contract';

import { StatusSchema } from './api-schemas.ts';

// The client↔server contract (oRPC v2, per the 2026-08-10 decision on #1244):
// the server implements it, the client derives its typed procedures from it —
// type-only, so no contract code reaches the bundle.

export const contract = {
  status: oc.output(StatusSchema),
};
