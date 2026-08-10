import { oc } from '@orpc/contract';
import { openapi } from '@orpc/openapi';

import { StatusSchema } from './api-schemas.ts';

// The single app contract (oRPC v2, per the 2026-08-10 decision on #1244):
// the server implements it once and serves it on both surfaces — typed RPC
// for the SPA and the public REST API with its generated OpenAPI document
// (#1248). The `openapi()` metadata is each procedure's REST shape.

export const contract = {
  status: oc
    .meta(
      openapi({ method: 'GET', path: '/status', summary: 'Instance status' }),
    )
    .output(StatusSchema),
};
