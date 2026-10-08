import { AccountRpcs } from './account.ts';
import { AuditRpcs } from './audit.ts';
import { ParticipantRpcs } from './participant.ts';
import { ProtocolsRpcs } from './protocols.ts';
import { SetupRpcs } from './setup.ts';
import { StatusRpcs } from './status.ts';
import { StudiesRpcs } from './studies.ts';
import { TeamRpcs } from './team.ts';
import { TelemetryRpcs } from './telemetry.ts';

export class StudioRpcs extends StatusRpcs.merge(
  SetupRpcs,
  AccountRpcs,
  TeamRpcs,
  StudiesRpcs,
  ProtocolsRpcs,
  AuditRpcs,
  ParticipantRpcs,
  TelemetryRpcs,
) {}

export const RPC_PATH = '/rpc';

export const WS_PATH = '/ws';
