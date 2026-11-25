import {
  INTERACTION_SOUND_SPRITE,
  type InteractionSoundName,
} from './interactionSoundSprite';

/** A sound that plays once. */
export type OneShotSoundName = {
  [
    Name in InteractionSoundName
  ]: (typeof INTERACTION_SOUND_SPRITE)[Name] extends {
    loop: true;
  }
    ? never
    : Name;
}[InteractionSoundName];

/** A sound that repeats until it is stopped. */
export type LoopingSoundName = Exclude<InteractionSoundName, OneShotSoundName>;

/** Stops a looping sound. Calling it again does nothing. */
export type StopSound = () => void;

export type SoundEngine = {
  /**
   * Turns sound on or off. Turning it on for the first time creates the audio
   * context and loads the sprite; turning it off stops a looping sound.
   */
  setEnabled: (enabled: boolean) => void;
  /** Plays a sound now, or not at all. */
  play: (name: OneShotSoundName) => void;
  /** Starts a looping sound now, or not at all. */
  startLoop: (name: LoopingSoundName) => StopSound;
  /**
   * Stops every sound, closes the audio context and stops listening to the
   * document. The decoded sprite is kept, so turning sound on again does not
   * load it again.
   */
  dispose: () => void;
};

// The structural parts of the Web Audio API the engine uses, so that a test
// can stand in for them.
type AudioParamLike = { value: number };
type SourceNodeLike = {
  buffer: object | null;
  loop: boolean;
  loopStart: number;
  loopEnd: number;
  readonly playbackRate: AudioParamLike;
  connect(destination: object): unknown;
  disconnect(): void;
  start(when?: number, offset?: number, duration?: number): void;
  stop(when?: number): void;
};
type GainNodeLike = {
  readonly gain: AudioParamLike;
  connect(destination: unknown): unknown;
};
export type AudioContextLike = {
  readonly state: AudioContextState | 'interrupted';
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
  /** Resolves with the sprite file's bytes. */
  loadSprite: () => Promise<ArrayBuffer>;
  /** Milliseconds; only differences are used. */
  now: () => number;
  /** In [0, 1). */
  random: () => number;
  /** Where gestures, visibility and connectivity are observed. */
  document: Document | undefined;
  window: Window | undefined;
};

/**
 * The interview's sprite. A static `new URL('./file', import.meta.url)` so
 * that every bundler emits the file at build time whether or not it is ever
 * played, which is what lets an installed app precache it.
 */
const INTERACTION_SOUND_SPRITE_URL = new URL(
  './interaction-sounds.wav',
  import.meta.url,
).href;

/**
 * The level of every sound. The sounds are normalised to a peak of 0 dBFS
 * and are much louder than the interface they accompany; half (-6 dB) keeps
 * them in the background, and leaves headroom for the looping sound and a
 * short sound to sum without clipping.
 */
export const MASTER_GAIN = 0.5;

/**
 * The most a varied sound's playback rate moves either way: ±4% is about
 * two-thirds of a semitone, enough that a sound repeated in quick succession
 * does not sound mechanical, too little to sound like a different sound.
 */
export const PITCH_VARIATION = 0.04;

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
 * person is heard.
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
 */
export const BURST_WINDOW_MS = 150;

const isMoreImportant = (a: OneShotSoundName, b: OneShotSoundName) =>
  PRIORITY.indexOf(a) < PRIORITY.indexOf(b);

async function fetchSprite(): Promise<ArrayBuffer> {
  // A plain request for exactly the emitted URL, so that a service worker
  // that precached the file answers it while offline.
  const response = await fetch(INTERACTION_SOUND_SPRITE_URL);
  if (!response.ok)
    throw new Error(`Sprite request failed: ${response.status}`);
  return response.arrayBuffer();
}

const defaultEnvironment = (): EngineEnvironment => ({
  createAudioContext: () => new AudioContext(),
  loadSprite: fetchSprite,
  now: () => performance.now(),
  random: Math.random,
  document: typeof document === 'undefined' ? undefined : document,
  window: typeof window === 'undefined' ? undefined : window,
});

type LoadState = 'idle' | 'loading' | 'loaded' | 'failed';

/**
 * A small Web Audio player for the interview's interaction sounds.
 *
 * Nothing is fetched, decoded or created while sound is off. Turning it on
 * creates one audio context and loads the sprite once; every sound then plays
 * from the decoded sprite without delay. A browser keeps a page's audio
 * context suspended until the person interacts with the page, so the engine
 * resumes it on the first pointer or key press. A sound that cannot play at
 * the moment it is asked for (sound off, sprite not loaded, context not yet
 * running, page hidden) is dropped, never played later.
 *
 * A failed load is silent. It is tried again once on the next turn on, or on
 * the first gesture after the device comes back online, never in a loop.
 */
export function createSoundEngine(
  environment: Partial<EngineEnvironment> = {},
): SoundEngine {
  const env = { ...defaultEnvironment(), ...environment };

  let enabled = false;
  let context: AudioContextLike | null = null;
  let master: GainNodeLike | null = null;
  let sprite: object | null = null;
  let loadState: LoadState = 'idle';
  let retryArmed = false;
  // The context was suspended because the page was hidden, and is resumed
  // when it is shown again.
  let suspendedWhileHidden = false;

  const lastPlayed = new Map<OneShotSoundName, number>();
  let lastSound: { name: OneShotSoundName; at: number } | null = null;
  let pending: OneShotSoundName | null = null;
  const loops = new Set<SourceNodeLike>();

  const isHidden = () => env.document?.visibilityState === 'hidden';

  const loadAndDecode = async () => {
    const bytes = await env.loadSprite();
    // Decoded by whichever context is open once the bytes arrive: a decoded
    // buffer can be played by any context.
    if (!context) throw new Error('The audio context was closed');
    return context.decodeAudioData(bytes);
  };

  const load = () => {
    if (loadState === 'loading' || loadState === 'loaded') return;
    loadState = 'loading';
    retryArmed = false;
    loadAndDecode().then(
      (decoded) => {
        sprite = decoded;
        loadState = 'loaded';
        return undefined;
      },
      () => {
        loadState = 'failed';
      },
    );
  };

  const stopLoops = () => {
    for (const source of loops) {
      try {
        source.stop();
        source.disconnect();
      } catch {
        // Already stopped.
      }
    }
    loops.clear();
  };

  const resume = () => {
    if (!context || context.state === 'running' || context.state === 'closed')
      return;
    context.resume().catch(() => undefined);
  };

  const onGesture = () => {
    if (!enabled) return;
    resume();
    if (loadState === 'failed' && retryArmed) load();
  };

  const onVisibilityChange = () => {
    if (!context) return;
    if (isHidden()) {
      if (context.state === 'running') {
        suspendedWhileHidden = true;
        context.suspend().catch(() => undefined);
      }
    } else if (suspendedWhileHidden) {
      suspendedWhileHidden = false;
      if (enabled) resume();
    }
  };

  const onOnline = () => {
    if (loadState === 'failed') retryArmed = true;
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

  /** Whether a sound started now would be heard now. */
  const ready = (): boolean =>
    enabled &&
    sprite !== null &&
    master !== null &&
    context?.state === 'running' &&
    !isHidden();

  const startSource = (name: InteractionSoundName, rate: number) => {
    if (!context || !master || !sprite) return null;
    const { start, duration } = INTERACTION_SOUND_SPRITE[name];
    const source = context.createBufferSource();
    source.buffer = sprite;
    source.playbackRate.value = rate;
    source.connect(master);
    return { source, start, duration };
  };

  const flush = () => {
    const name = pending;
    pending = null;
    if (name === null || !ready()) return;

    const now = env.now();
    const previous = lastPlayed.get(name);
    if (previous !== undefined && now - previous < MIN_INTERVAL_MS[name]) {
      return;
    }
    if (
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
    const started = startSource(name, rate);
    if (!started) return;
    started.source.start(0, started.start, started.duration);
    lastPlayed.set(name, now);
    lastSound = { name, at: now };
  };

  return {
    setEnabled: (next) => {
      if (next === enabled) return;
      enabled = next;
      if (!next) {
        stopLoops();
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
      // The next turn on is the moment a failed load is tried again.
      if (loadState === 'idle' || loadState === 'failed') load();
    },

    play: (name) => {
      if (!enabled) return;
      // Sounds asked for together (one action, or several dispatched in one
      // go) are gathered, and the most important plays once they all have
      // been asked for: within the same task, before anything is painted.
      if (pending === null) {
        pending = name;
        queueMicrotask(flush);
      } else if (isMoreImportant(name, pending)) {
        pending = name;
      }
    },

    startLoop: (name) => {
      if (!ready()) return () => undefined;
      const started = startSource(name, 1);
      if (!started) return () => undefined;
      const { source, start, duration } = started;
      source.loop = true;
      source.loopStart = start;
      source.loopEnd = start + duration;
      source.start(0, start);
      loops.add(source);
      return () => {
        if (!loops.delete(source)) return;
        try {
          source.stop();
          source.disconnect();
        } catch {
          // Already stopped.
        }
      };
    },

    dispose: () => {
      enabled = false;
      pending = null;
      stopLoops();
      listen(false);
      const closing = context;
      context = null;
      master = null;
      suspendedWhileHidden = false;
      closing?.close().catch(() => undefined);
    },
  };
}
