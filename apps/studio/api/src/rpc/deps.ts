import type { Context } from 'effect';

import type { DeniedAttempts } from '../audit/denial-rate-limit.ts';
import type { AuditSignal } from '../audit/signal.ts';
import type { AuthService } from '../auth/service.ts';
import type { Database } from '../db/client.ts';
import type {
  AuthCapabilities,
  DeploymentStatus,
  InstallationReader,
} from '../domain.ts';
import type { Jobs } from '../jobs/jobs.ts';
import type { Analytics } from '../platform/analytics.ts';
import type { RateLimiter } from '../rate-limit/limiter.ts';
import type { SecretsCipher } from '../secrets/services.ts';

export type RpcDeps = {
  readonly capabilities: AuthCapabilities;
  readonly deployment: DeploymentStatus;
  readonly readInstallation: InstallationReader;
  readonly services?: Context.Context<StudioServices> | undefined;
};

export type StudioServices =
  | Database
  | AuditSignal
  | Jobs
  | SecretsCipher
  | DeniedAttempts
  | Analytics;

export type RpcServices = StudioServices | AuthService | RateLimiter;
