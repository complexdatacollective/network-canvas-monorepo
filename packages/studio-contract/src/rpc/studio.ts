import { AccountRpcs } from './account.ts';
import { AuditRpcs } from './audit.ts';
import { ProtocolsRpcs } from './protocols.ts';
import { SetupRpcs } from './setup.ts';
import { StatusRpcs } from './status.ts';
import { StudiesRpcs } from './studies.ts';
import { TeamRpcs } from './team.ts';

// The rpc plane: every procedure Studio's own client calls, in one group.
//
// `merge` is the instance method, and it preserves each group's own
// middleware — so the public `status` and bootstrap-token `setup.complete`
// procedures stay unauthenticated here while the other five groups keep
// `Authenticated`. Merging cannot be replaced by declaring the procedures in
// one group with one `.middleware()` call, because `.middleware()` applies to
// every rpc added to a group up to that point.
//
// `ParticipantRpcs` is deliberately absent. Nothing in today's server can
// serve its four procedures; #1899 merges the group here when its handlers
// land, and merging it earlier would declare a surface that answers nothing.

export class StudioRpcs extends StatusRpcs.merge(
  SetupRpcs,
  AccountRpcs,
  TeamRpcs,
  StudiesRpcs,
  ProtocolsRpcs,
  AuditRpcs,
) {}

export { StudioStreams } from '../sync/protocolBuilder.ts';

/** Where `StudioRpcs` is served. */
export const RPC_PATH = '/rpc';

/** Where `StudioStreams` is served. */
export const WS_PATH = '/ws';
