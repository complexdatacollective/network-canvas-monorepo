'use client';

import { createContext, type ReactNode, useContext, useEffect } from 'react';

import { DragFeedbackListener } from '@codaco/fresco-ui/dnd/DragFeedbackListener';
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

const DROP_SOUNDS = [
  'discard',
  'drop-node',
  'toggle-on',
  'toggle-off',
] as const;

/**
 * The sound of a drop, which the drop target declares as its `dropFeedback`
 * by what a drop on it does: `discard` for deleting the person (the bin),
 * `drop-node` for placing them (in a bin, on the sociogram), `toggle-on` for
 * adding them to the question (a name generator's main list), `toggle-off`
 * for taking them off it (back to a side panel or the roster, or to the
 * sociogram's drawer). It plays only once the target's drop handler says it
 * took the drop (see `DropOutcome`): when the change is stored, or, for the
 * "other" bin, when its question is answered. A drop the handler refuses (a
 * write that fails, a passphrase that is needed first, a question that is
 * cancelled) is silent.
 */
export type DropSound = (typeof DROP_SOUNDS)[number];

const isDropSound = (feedback: string | undefined): feedback is DropSound =>
  DROP_SOUNDS.some((sound) => sound === feedback);

/**
 * Gives the interview's components its interaction sounds. Its forms are
 * heard here too: the error sound whenever one refuses a submission, and a
 * toggle sound whenever the participant chooses an option in a field
 * (`toggle-on` for selecting, ticking or turning on, `toggle-off` for
 * unticking, turning off or clearing). A choice that also changes the
 * network, such as an answer that makes a connection, asks for both sounds
 * at once, and the engine plays only the more important.
 *
 * So is dragging: `tap-button` whenever a drag picks a person up (by pointer
 * or keyboard, never for a tap), and the drop target's `DropSound` whenever
 * one is dropped and the target takes them. That sound is the only one heard
 * for the drop: what the drop changes in the network makes no sound of its
 * own (see the store's sound listener). A drag that ends where nothing
 * accepts the person, is cancelled, or is refused by the target makes no
 * sound as it ends.
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
        <DragFeedbackListener
          onDragStart={() => engine.play('tap-button', { standalone: true })}
          onDrop={(feedback, drop) =>
            engine.drop(isDropSound(feedback) ? feedback : null, drop)
          }
        >
          {children}
        </DragFeedbackListener>
      </FormFeedbackListener>
    </InteractionSoundsContext>
  );
}

/**
 * Plays the interview's interaction sounds, for a sound whose meaning lives in
 * a component (a person placed in a bin by choosing it, the end of the
 * interview). Silent
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
