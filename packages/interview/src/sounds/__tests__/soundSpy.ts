import { vi } from 'vitest';

import { createInteractionSoundListenerMiddleware } from '../../store/middleware/interactionSoundListener';
import type { OneShotSoundName, SoundEngine } from '../soundEngine';

/**
 * Records every sound the interview asks for, from its components (through
 * `engine`, for `InteractionSoundsProvider`) and from its store (through
 * `middleware`) alike, so a test can see that one action asks for one sound.
 */
export function createSoundSpy() {
  const play = vi.fn<(name: OneShotSoundName) => void>();
  const engine: SoundEngine = {
    play,
    startLoop: () => () => undefined,
    setEnabled: () => undefined,
    dispose: () => undefined,
  };
  const { middleware } = createInteractionSoundListenerMiddleware({ play });
  return { play, engine, middleware };
}
