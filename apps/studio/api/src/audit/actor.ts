import { Context, Effect } from 'effect';

import { AuditActor } from '@codaco/studio-contract/middleware/audit-actor';
import { Principal } from '@codaco/studio-contract/middleware/authenticated';

export const userAuditActor = (
  principal: Principal['Service'],
): AuditActor['Service'] =>
  AuditActor.of({
    kind: 'user',
    id: principal.userId,
    label: (principal.name.trim() || principal.email).slice(0, 320),
  });

export const provideCaller =
  (principal: Principal['Service']) =>
  <A, E, R>(
    effect: Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E, Exclude<R, Principal | AuditActor>> =>
    Effect.provideContext(
      effect,
      Context.make(Principal, principal).pipe(
        Context.add(AuditActor, userAuditActor(principal)),
      ),
    );
