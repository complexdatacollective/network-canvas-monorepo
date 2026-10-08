import { Context, Effect, MutableRef, Option } from 'effect';

export class RequestTeam extends Context.Service<
  RequestTeam,
  MutableRef.MutableRef<Option.Option<string>>
>()('@studio/RequestTeam') {
  static readonly make = (): RequestTeam['Service'] =>
    MutableRef.make(Option.none());
}

export const recordRequestTeam = (teamId: string): Effect.Effect<void> =>
  Effect.map(Effect.serviceOption(RequestTeam), (slot) => {
    if (Option.isSome(slot)) MutableRef.set(slot.value, Option.some(teamId));
  });
