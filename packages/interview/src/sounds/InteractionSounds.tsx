'use client';

import { createContext, type ReactNode, useContext, useEffect } from 'react';

import { FormFeedbackListener } from '@codaco/fresco-ui/form/FormFeedbackListener';

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
 * Gives the interview's components its interaction sounds. Its forms are
 * heard here too: the error sound whenever one refuses a submission, and a
 * toggle sound whenever the participant chooses an option in a field
 * (`toggle-on` for selecting, ticking or turning on, `toggle-off` for
 * unticking, turning off or clearing). A choice that also changes the
 * network, such as an answer that makes a connection, asks for both sounds
 * at once, and the engine plays only the more important.
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
      <FormFeedbackListener
        onInvalidSubmit={() => engine.play('error')}
        onOptionToggle={(selected) =>
          engine.play(selected ? 'toggle-on' : 'toggle-off')
        }
      >
        {children}
      </FormFeedbackListener>
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

/**
 * Plays a looping sound for as long as `playing` is true. If the sound cannot
 * be heard yet (sound is off, or the sound file is still loading), it starts
 * as soon as it can; turning sound off stops it, and turning sound on again
 * starts it again.
 */
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
