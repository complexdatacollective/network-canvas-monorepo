import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';

import { Authenticated } from '../middleware/authenticated.ts';
import {
  AuditEventDetail,
  AuditFilterOptions,
  AuditGetInput,
  AuditListInput,
  AuditListOutput,
} from '../schema/audit.ts';
import { Forbidden, NotFound, RateLimited } from '../schema/errors.ts';
import { TeamScoped } from '../schema/team.ts';

export const AuditRpcs = RpcGroup.make(
  Rpc.make('audit.list', {
    payload: AuditListInput,
    success: AuditListOutput,
    error: Schema.Union([Forbidden, NotFound, RateLimited]),
  }),
  Rpc.make('audit.get', {
    payload: AuditGetInput,
    success: AuditEventDetail,
    error: Schema.Union([Forbidden, NotFound, RateLimited]),
  }),
  Rpc.make('audit.filterOptions', {
    payload: TeamScoped,
    success: AuditFilterOptions,
    error: Schema.Union([Forbidden, RateLimited]),
  }),
).middleware(Authenticated);
