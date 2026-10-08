import { Effect, Layer } from 'effect';

import { InstallationIdentity } from '../../installation-identity.ts';

export const knownInstallation = (
  installationId: string,
): Layer.Layer<InstallationIdentity> =>
  Layer.effectDiscard(
    Effect.flatMap(InstallationIdentity, (identity) =>
      identity.record(installationId),
    ),
  ).pipe(Layer.provideMerge(InstallationIdentity.layer));
