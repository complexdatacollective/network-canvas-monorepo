'use client';

import { createContext, type ReactNode, useContext, useEffect } from 'react';

import { InvalidSubmitListener } from '@codaco/fresco-ui/form/InvalidSubmitListener';

import type {
  LoopingSoundName,
  OneShotSoundName,
  SoundEngine,
  StopSound,
} from './soundEngine';

type InteractionSounds = {
  play: (name: OneShotSoundName) => void;
  startLoop: (name: LoopingSoundName) => StopSound;
};

const SILENT: InteractionSounds = {
  play: () => undefined,
  startLoop: () => () => undefined,
};

const InteractionSoundsContext = createContext<InteractionSounds>(SILENT);

/**
 * Gives the interview's components its interaction sounds, and plays the
 * error sound whenever one of its forms refuses a submission.
 */
export function InteractionSoundsProvider({
  engine,
  children,
}: {
  engine: SoundEngine;
  children: ReactNode;
}) {
  return (
    <InteractionSoundsContext value={engine}>
      <InvalidSubmitListener onInvalidSubmit={() => engine.play('error')}>
        {children}
      </InvalidSubmitListener>
    </InteractionSoundsContext>
  );
}

/**
 * Plays the interview's interaction sounds, for a sound whose meaning lives in
 * a component (a person placed in a bin, the end of the interview). Silent
 * when the host has not turned sounds on, and outside a Shell. The functions
 * are stable for the life of the Shell.
 */
export const useInteractionSound = (): InteractionSounds =>
  useContext(InteractionSoundsContext);

/** Plays a looping sound for as long as `playing` is true. */
export function useLoopingInteractionSound(
  name: LoopingSoundName,
  playing: boolean,
) {
  const { startLoop } = useInteractionSound();
  useEffect(() => {
    if (!playing) return undefined;
    return startLoop(name);
  }, [startLoop, name, playing]);
}
