import { describe, expect, it } from '@effect/vitest';
import { Effect, Exit, Scope } from 'effect';

import { sectionId } from '@codaco/studio-sync/taxonomy';

import { Presence } from '../presence.ts';

const SETTINGS = sectionId({ kind: 'settings' });

const viewer = {
  sessionId: 'ws:1',
  userId: 'user',
  displayName: 'Researcher',
  mode: 'viewing',
} as const;

describe('Presence', () => {
  // Mutation: drop the release of `join`'s `acquireRelease` → the editing
  // entry outlives the connection.
  it.effect('goes with the connection, whatever a lock made of it', () =>
    Effect.gen(function* () {
      const presence = yield* Presence;
      const connection = yield* Scope.make();
      yield* presence.join('draft', viewer).pipe(Scope.provide(connection));
      yield* presence.put('draft', {
        ...viewer,
        mode: 'editing',
        sectionId: SETTINGS,
      });
      expect(yield* presence.list('draft')).toEqual([
        { ...viewer, mode: 'editing', sectionId: SETTINGS },
      ]);

      yield* Scope.close(connection, Exit.void);
      expect(yield* presence.list('draft')).toEqual([]);
    }).pipe(Effect.provide(Presence.layer)),
  );

  it.effect('moves a present connection between modes, and nobody else', () =>
    Effect.gen(function* () {
      const presence = yield* Presence;
      yield* presence.join('draft', viewer);
      yield* presence.setMode('draft', 'ws:1', 'editing', SETTINGS);
      yield* presence.setMode('draft', 'ws:absent', 'editing', SETTINGS);
      expect(yield* presence.list('draft')).toEqual([
        { ...viewer, mode: 'editing', sectionId: SETTINGS },
      ]);

      yield* presence.setMode('draft', 'ws:1', 'viewing');
      expect(yield* presence.list('draft')).toEqual([viewer]);
    }).pipe(Effect.scoped, Effect.provide(Presence.layer)),
  );
});
