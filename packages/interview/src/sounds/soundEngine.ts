import type { DropOutcome } from '@codaco/fresco-ui/dnd/types';

import {
  INTERACTION_SOUND_FILES,
  type InteractionSoundName,
} from './interactionSoundFiles';

/** A sound that plays once. */
export type OneShotSoundName = {
  [
    Name in InteractionSoundName
  ]: (typeof INTERACTION_SOUND_FILES)[Name] extends {
    loop: true;
  }
    ? never
    : Name;
}[InteractionSoundName];

/** A sound that repeats until it is stopped. */
export type LoopingSoundName = Exclude<InteractionSoundName, OneShotSoundName>;

/**
 * Says that a looping sound is no longer wanted, and stops it if it is
 * playing. Calling it again does nothing.
 */
export type StopSound = () => void;

export type PlayOptions = {
  /**
   * The sound begins or ends an action of its own (an item picked up or put
   * down by dragging), so it is never taken for part of an earlier change:
   * the burst window of a sound played just before does not hold it back.
   */
  standalone?: boolean;
};

export type SoundEngine = {
  /**
   * Turns sound on or off. Turning it on for the first time creates the audio
   * context and loads every sound file; turning it off stops every sound that
   * is playing.
   */
  setEnabled: (enabled: boolean) => void;
  /** Plays a sound now, or not at all. */
  play: (name: OneShotSoundName, options?: PlayOptions) => void;
  /**
   * Carries out a drop: calls `perform`, the drop target's own handling,
   * which runs whether sound is on or off, and plays `name` (none when it is
   * null) as the drop's sound, as a standalone sound, once `perform` says it
   * took the drop: at once when it returns anything but `false`, or when the
   * promise it returns resolves to anything but `false`. A drop it refuses is
   * silent. While `perform` runs, `isHandlingDrop` is true, so that what the
   * drop changes is heard as the drop's sound alone.
   */
  drop: (name: OneShotSoundName | null, perform: () => DropOutcome) => void;
  /** Whether a drop's handling (`drop`'s `perform`) is running now. */
  isHandlingDrop: () => boolean;
  /**
   * Asks for a looping sound until the returned function is called. The
   * sound plays whenever it can be heard: at once if sound is on, its file is
   * loaded, the context is running and the page is shown, or else as soon as
   * all of these are true. Turning sound off stops it, and turning sound
   * on again starts it again.
   */
  startLoop: (name: LoopingSoundName) => StopSound;
  /**
   * Stops every sound, closes the audio context and stops listening to the
   * document. The decoded sounds are kept, so turning sound on again does not
   * load them again, and so are the looping sounds that are still wanted,
   * which start again once sound is turned on again.
   */
  dispose: () => void;
};

// The structural parts of the Web Audio API the engine uses, so that a test
// can stand in for them.
type AudioParamLike = { value: number };
type SourceNodeLike = {
  buffer: object | null;
  loop: boolean;
  readonly playbackRate: AudioParamLike;
  addEventListener(
    type: 'ended',
    listener: () => void,
    options?: AddEventListenerOptions,
  ): void;
  connect(destination: object): unknown;
  disconnect(): void;
  start(when?: number): void;
  stop(when?: number): void;
};
type GainNodeLike = {
  readonly gain: AudioParamLike;
  connect(destination: unknown): unknown;
};
export type AudioContextLike = {
  readonly state: AudioContextState | 'interrupted';
  addEventListener(type: 'statechange', listener: () => void): void;
  removeEventListener(type: 'statechange', listener: () => void): void;
  readonly destination: unknown;
  resume(): Promise<void>;
  suspend(): Promise<void>;
  close(): Promise<void>;
  decodeAudioData(data: ArrayBuffer): Promise<object>;
  createGain(): GainNodeLike;
  createBufferSource(): SourceNodeLike;
};

type EngineEnvironment = {
  createAudioContext: () => AudioContextLike;
  /** Resolves with one sound file's bytes. */
  loadSound: (name: InteractionSoundName) => Promise<ArrayBuffer>;
  /** Milliseconds; only differences are used. */
  now: () => number;
  /** In [0, 1). */
  random: () => number;
  /** Runs `callback` once the current task has finished. */
  afterTask: (callback: () => void) => void;
  /** Where gestures, visibility and connectivity are observed. */
  document: Document | undefined;
  window: Window | undefined;
};

/**
 * The level of every sound. The sounds are normalised to a peak of 0 dBFS
 * and are much louder than the interface they accompany; half (-6 dB) keeps
 * them in the background, and leaves headroom for the looping sound and a
 * short sound to sum without clipping.
 */
export const MASTER_GAIN = 0.5;

/**
 * The most a varied sound's playback rate moves either way: ±1.5% is about a
 * quarter of a semitone, enough that a sound repeated in quick succession
 * does not sound mechanical, too little to be heard as a change of pitch.
 */
export const PITCH_VARIATION = 0.015;

/** Sounds that repeat often enough to be varied in pitch. */
const VARIED_SOUNDS: ReadonlySet<OneShotSoundName> = new Set<OneShotSoundName>([
  'create-node',
  'discard',
  'toggle-on',
  'toggle-off',
  'create-edge',
  'drop-node',
  'tap-button',
]);

/**
 * The shortest time between two plays of the same sound, in milliseconds.
 * One action that changes several things (removing a person removes their
 * connections too) plays its sound once; so does one that is repeated
 * faster than a person could mean it.
 */
export const MIN_INTERVAL_MS: Readonly<Record<OneShotSoundName, number>> = {
  'create-node': 200,
  'discard': 150,
  'toggle-on': 100,
  'toggle-off': 100,
  'create-edge': 150,
  'drop-node': 150,
  'tap-button': 100,
  'error': 400,
  // Longer than the sound itself, so a remounted finish stage does not play
  // it again over itself.
  'finish-interview': 3000,
};

/**
 * Which sound wins when one action asks for several, most important first.
 * Removing a person removes their connections, and only the removal of the
 * person is heard. Every sound a drop can make outranks `tap-button`, the
 * sound of picking an item up, so a drop that follows a pick-up within the
 * burst window is still heard.
 */
const PRIORITY: readonly OneShotSoundName[] = [
  'error',
  'finish-interview',
  'discard',
  'create-node',
  'drop-node',
  'create-edge',
  'toggle-on',
  'toggle-off',
  'tap-button',
];

/**
 * After a sound plays, a less important one asked for within this many
 * milliseconds is not played: the second is part of the same change (an undo
 * that brings a person back, then their connections, one write at a time).
 * A standalone sound (see `PlayOptions`) is not held back.
 */
export const BURST_WINDOW_MS = 150;

const isMoreImportant = (a: OneShotSoundName, b: OneShotSoundName) =>
  PRIORITY.indexOf(a) < PRIORITY.indexOf(b);

const isSoundName = (key: string): key is InteractionSoundName =>
  Object.hasOwn(INTERACTION_SOUND_FILES, key);

const SOUND_NAMES: readonly InteractionSoundName[] = Object.keys(
  INTERACTION_SOUND_FILES,
).filter(isSoundName);

async function fetchSound(name: InteractionSoundName): Promise<ArrayBuffer> {
  // A plain request for exactly the emitted URL, so that a service worker
  // that precached the file answers it while offline.
  const response = await fetch(INTERACTION_SOUND_FILES[name].url);
  if (!response.ok)
    throw new Error(`Sound request failed (${name}): ${response.status}`);
  return response.arrayBuffer();
}

const defaultEnvironment = (): EngineEnvironment => ({
  createAudioContext: () => new AudioContext(),
  loadSound: fetchSound,
  now: () => performance.now(),
  random: Math.random,
  afterTask: (callback) => {
    setTimeout(callback, 0);
  },
  document: typeof document === 'undefined' ? undefined : document,
  window: typeof window === 'undefined' ? undefined : window,
});

type LoadState = 'idle' | 'loading' | 'loaded' | 'failed';

type WantedLoop = { name: LoopingSoundName; source: SourceNodeLike | null };

/**
 * A small Web Audio player for the interview's interaction sounds.
 *
 * Nothing is fetched, decoded or created while sound is off. Turning it on
 * creates one audio context and loads every sound's file once, all at the
 * same time; each sound then plays from its own decoded buffer without
 * delay. A browser keeps a page's audio context suspended until the person
 * interacts with the page, so the engine resumes it on the first pointer or
 * key press. A sound that plays once and cannot play at the moment it is
 * asked for (sound off, its file not loaded, context not yet running, page
 * hidden) is dropped, never played later. For the same reason, hiding the
 * page or turning sound off stops such a sound part-way through.
 *
 * A looping sound is different: it accompanies something that lasts (a node
 * waiting to be connected), so it plays whenever it can be heard for as long
 * as it is wanted. One asked for before it can be heard starts once it can;
 * turning sound off stops it and turning sound on again starts it again;
 * hiding the page pauses it with the context, and showing the page again
 * resumes it.
 *
 * A drag is heard as two separate actions: picking the item up, and
 * dropping it. Each plays as a standalone sound, which the burst window of an
 * earlier sound does not hold back, so a drag sounds the same however soon it
 * follows something else; and every drop sound outranks the pick-up, so a
 * drop made just after the pick-up is heard too. A drop is carried out
 * through `drop`, which marks the time its handling runs, so that what it
 * changes in the network is heard as the drop's sound and nothing else, and
 * plays that sound only for a drop the target takes.
 *
 * Each file loads on its own, and a sound plays once its own file is
 * decoded: one request that fails (a dropped connection, say) silences only
 * that sound, and trying again fetches only the files that failed. A failed
 * file is silent. It is tried again once on the next turn on, or on the
 * first gesture after the device comes back online, never in a loop.
 */
export function createSoundEngine(
  environment: Partial<EngineEnvironment> = {},
): SoundEngine {
  const env = { ...defaultEnvironment(), ...environment };

  let enabled = false;
  let context: AudioContextLike | null = null;
  let master: GainNodeLike | null = null;
  const buffers = new Map<InteractionSoundName, object>();
  const loadStates = new Map<InteractionSoundName, LoadState>(
    SOUND_NAMES.map((name) => [name, 'idle']),
  );
  let retryArmed = false;
  // The context was suspended because the page was hidden, and is resumed
  // when it is shown again.
  let suspendedWhileHidden = false;

  const lastPlayed = new Map<OneShotSoundName, number>();
  let lastSound: { name: OneShotSoundName; at: number } | null = null;
  let pending: { name: OneShotSoundName; standalone: boolean } | null = null;
  // How many drops are being carried out at this moment.
  let dropDepth = 0;
  // Looping sounds that are wanted, each with its source while it plays.
  const wantedLoops = new Set<WantedLoop>();
  // Sounds that play once and have not yet ended.
  const oneShots = new Set<SourceNodeLike>();

  const isHidden = () => env.document?.visibilityState === 'hidden';

  const anyFailed = () =>
    SOUND_NAMES.some((name) => loadStates.get(name) === 'failed');

  const loadAndDecode = async (name: InteractionSoundName) => {
    const bytes = await env.loadSound(name);
    // Decoded by whichever context is open once the bytes arrive: a decoded
    // buffer can be played by any context.
    if (!context) throw new Error('The audio context was closed');
    return context.decodeAudioData(bytes);
  };

  // Loads every file that has not loaded and is not loading.
  const load = () => {
    retryArmed = false;
    for (const name of SOUND_NAMES) {
      const state = loadStates.get(name);
      if (state === 'loading' || state === 'loaded') continue;
      loadStates.set(name, 'loading');
      loadAndDecode(name).then(
        (decoded) => {
          buffers.set(name, decoded);
          loadStates.set(name, 'loaded');
          startWantedLoops();
          return undefined;
        },
        () => {
          loadStates.set(name, 'failed');
        },
      );
    }
  };

  const stopSource = (source: SourceNodeLike) => {
    try {
      source.stop();
      source.disconnect();
    } catch {
      // Already stopped.
    }
  };

  // The loops stay wanted, and start again once they can be heard.
  const stopWantedLoops = () => {
    for (const loop of wantedLoops) {
      if (loop.source) stopSource(loop.source);
      loop.source = null;
    }
  };

  // A suspended context keeps a sound where it was, and resuming it would
  // play the rest of a sound asked for long before.
  const stopOneShots = () => {
    for (const source of oneShots) stopSource(source);
    oneShots.clear();
  };

  const resume = () => {
    if (!context || context.state === 'running' || context.state === 'closed')
      return;
    context.resume().catch(() => undefined);
  };

  const onGesture = () => {
    if (!enabled) return;
    resume();
    if (retryArmed && anyFailed()) load();
  };

  const onVisibilityChange = () => {
    if (!context) return;
    if (isHidden()) {
      stopOneShots();
      if (context.state === 'running') {
        suspendedWhileHidden = true;
        context.suspend().catch(() => undefined);
      }
    } else {
      if (suspendedWhileHidden) {
        suspendedWhileHidden = false;
        if (enabled) resume();
      }
      startWantedLoops();
    }
  };

  const onOnline = () => {
    if (anyFailed()) retryArmed = true;
  };

  let listening = false;
  const listen = (on: boolean) => {
    if (listening === on) return;
    listening = on;
    const method = on ? 'addEventListener' : 'removeEventListener';
    env.document?.[method]('pointerdown', onGesture, true);
    env.document?.[method]('keydown', onGesture, true);
    env.document?.[method]('visibilitychange', onVisibilityChange);
    env.window?.[method]('online', onOnline);
  };

  /** Whether a sound whose file is loaded, started now, would be heard now. */
  const ready = (): boolean =>
    enabled && master !== null && context?.state === 'running' && !isHidden();

  // Starts a sound from the beginning of its own buffer, if it is loaded.
  const startSource = (
    name: InteractionSoundName,
    rate: number,
    loop: boolean,
  ) => {
    const buffer = buffers.get(name);
    if (!context || !master || !buffer) return null;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = loop;
    source.playbackRate.value = rate;
    source.connect(master);
    source.start(0);
    return source;
  };

  // Starts every wanted loop that is not playing, if it would be heard. A
  // loop that is playing is left alone: while the context is suspended it is
  // paused, and it carries on when the context runs again.
  function startWantedLoops() {
    if (!ready()) return;
    for (const loop of wantedLoops) {
      // The whole buffer repeats: the file is exactly one cycle.
      loop.source ??= startSource(loop.name, 1, true);
    }
  }

  const flush = () => {
    const request = pending;
    pending = null;
    if (request === null || !ready()) return;
    const { name, standalone } = request;

    const now = env.now();
    const previous = lastPlayed.get(name);
    if (previous !== undefined && now - previous < MIN_INTERVAL_MS[name]) {
      return;
    }
    if (
      !standalone &&
      lastSound &&
      lastSound.name !== name &&
      now - lastSound.at < BURST_WINDOW_MS &&
      !isMoreImportant(name, lastSound.name)
    ) {
      return;
    }

    const rate = VARIED_SOUNDS.has(name)
      ? 1 + (env.random() * 2 - 1) * PITCH_VARIATION
      : 1;
    const source = startSource(name, rate, false);
    if (!source) return;
    source.addEventListener(
      'ended',
      () => {
        oneShots.delete(source);
      },
      { once: true },
    );
    oneShots.add(source);
    lastPlayed.set(name, now);
    lastSound = { name, at: now };
  };

  const play: SoundEngine['play'] = (name, options) => {
    if (!enabled) return;
    const standalone = options?.standalone ?? false;
    // Sounds asked for together are gathered, and the most important plays
    // once the task that asked for them has finished: one action, several
    // dispatched in one go, or one choice heard twice, as an option chosen
    // in a field whose answer also makes a connection (the connection is
    // stored a few promise callbacks after the choice, in the same task).
    if (pending === null) {
      pending = { name, standalone };
      env.afterTask(flush);
    } else if (isMoreImportant(name, pending.name)) {
      pending = { name, standalone };
    }
  };

  return {
    setEnabled: (next) => {
      if (next === enabled) return;
      enabled = next;
      if (!next) {
        stopWantedLoops();
        stopOneShots();
        pending = null;
        listen(false);
        if (context?.state === 'running') {
          context.suspend().catch(() => undefined);
        }
        return;
      }
      listen(true);
      if (!context) {
        try {
          context = env.createAudioContext();
          context.addEventListener('statechange', startWantedLoops);
          master = context.createGain();
          master.gain.value = MASTER_GAIN;
          master.connect(context.destination);
        } catch {
          // No Web Audio here: sound stays silent.
          context = null;
          master = null;
          return;
        }
      } else {
        // Suspended when sound was turned off. Turning it on is usually a
        // gesture, so this normally succeeds; if not, the next gesture
        // resumes it.
        resume();
      }
      // The next turn on is the moment a failed file is tried again.
      load();
      // The context may still be running from before sound was turned off.
      startWantedLoops();
    },

    play,

    drop: (name, perform) => {
      dropDepth += 1;
      let outcome: DropOutcome;
      try {
        outcome = perform();
      } finally {
        dropDepth -= 1;
      }
      if (name === null) return;
      const heard = (taken: boolean | void) => {
        if (taken !== false) play(name, { standalone: true });
      };
      // A drop that is taken once a write is stored (or a question answered)
      // is heard then. A handler that fails is not heard, and its failure is
      // left to surface as it would without sound.
      if (outcome instanceof Promise) void outcome.then(heard);
      else heard(outcome);
    },

    isHandlingDrop: () => dropDepth > 0,

    startLoop: (name) => {
      const loop: WantedLoop = { name, source: null };
      wantedLoops.add(loop);
      startWantedLoops();
      return () => {
        if (!wantedLoops.delete(loop)) return;
        if (loop.source) stopSource(loop.source);
        loop.source = null;
      };
    },

    dispose: () => {
      enabled = false;
      pending = null;
      stopWantedLoops();
      stopOneShots();
      listen(false);
      const closing = context;
      closing?.removeEventListener('statechange', startWantedLoops);
      context = null;
      master = null;
      suspendedWhileHidden = false;
      closing?.close().catch(() => undefined);
    },
  };
}
