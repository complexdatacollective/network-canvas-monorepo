import {
  Context,
  Duration,
  Effect,
  Layer,
  MutableRef,
  Option,
  Schedule,
} from 'effect';

const RETRY_CEILING = Duration.seconds(30);

const retry = Schedule.exponential(Duration.seconds(1)).pipe(
  Schedule.modifyDelay(({ duration }) =>
    Effect.succeed(Duration.min(duration, RETRY_CEILING)),
  ),
);

export class InstallationIdentity extends Context.Service<
  InstallationIdentity,
  {
    readonly current: () => Option.Option<string>;
    readonly record: (installationId: string) => Effect.Effect<void>;
  }
>()('@studio/platform/InstallationIdentity') {
  static readonly layer: Layer.Layer<InstallationIdentity> = Layer.sync(
    InstallationIdentity,
    () => {
      const known = MutableRef.make(Option.none<string>());
      return InstallationIdentity.of({
        current: () => MutableRef.get(known),
        record: (installationId) =>
          Effect.sync(() => MutableRef.set(known, Option.some(installationId))),
      });
    },
  );

  static readonly resolveOnce = <R>(
    read: Effect.Effect<string | null, unknown, R>,
  ): Effect.Effect<boolean, never, InstallationIdentity | R> =>
    Effect.flatMap(InstallationIdentity, (identity) =>
      read.pipe(
        Effect.flatMap((installationId) =>
          installationId === null
            ? Effect.succeed(false)
            : Effect.as(identity.record(installationId), true),
        ),
        Effect.catchCause((cause) =>
          Effect.as(
            Effect.logDebug('The installation id could not be read', cause),
            false,
          ),
        ),
      ),
    );

  static readonly resolvedBy = <R>(
    read: Effect.Effect<string | null, unknown, R>,
  ): Layer.Layer<never, never, InstallationIdentity | R> =>
    Layer.effectDiscard(
      InstallationIdentity.resolveOnce(read).pipe(
        Effect.repeat({
          until: (found) => found,
          schedule: retry,
        }),
        Effect.forkScoped,
      ),
    );
}
