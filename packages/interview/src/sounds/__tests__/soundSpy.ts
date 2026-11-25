import { vi } from 'vitest';

import type { DropOutcome } from '@codaco/fresco-ui/dnd/types';

import { createInteractionSoundListenerMiddleware } from '../../store/middleware/interactionSoundListener';
import type { OneShotSoundName, SoundEngine } from '../soundEngine';

/**
 * Records every sound the interview asks for, from its components and its
 * drags and drops (through `engine`, for `InteractionSoundsProvider`) and
 * from its store (through `middleware`) alike, so a test can see that one
 * action asks for one sound.
 */
export function createSoundSpy() {
  const play = vi.fn<(name: OneShotSoundName) => void>();
  // Carries a drop out as the engine does: the drop's own sound once the
  // target takes it, none for a drop it refuses, and nothing for what it
  // changes.
  let dropDepth = 0;
  const engine: SoundEngine = {
    play,
    drop: (name, perform) => {
      dropDepth += 1;
      let outcome: DropOutcome;
      try {
        outcome = perform();
      } finally {
        dropDepth -= 1;
      }
      const heard = (taken: boolean | void) => {
        if (name !== null && taken !== false) play(name);
      };
      if (outcome instanceof Promise) void outcome.then(heard);
      else heard(outcome);
    },
    isHandlingDrop: () => dropDepth > 0,
    startLoop: () => () => undefined,
    setEnabled: () => undefined,
    dispose: () => undefined,
  };
  const { middleware } = createInteractionSoundListenerMiddleware(engine);
  return { play, engine, middleware };
}
