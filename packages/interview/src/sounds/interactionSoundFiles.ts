/**
 * The interview's interaction sounds, one MP3 file each, and whether each
 * repeats until it is stopped.
 *
 * The files were made once from Interviewer Classic's sound files
 * (`apps/interviewer-classic/src/interaction-sounds`): each was trimmed to
 * start 1 ms before its first sample louder than -50 dBFS (a sound that
 * starts late sounds late) and to end 5 ms after its last, with a fade over
 * those 5 ms so the cut does not click. The looping sound keeps its trailing
 * silence, which is part of its rhythm. They were then encoded with LAME 4.0
 * (`lame -V 2 -q 0 --noreplaygain`), whose header gives the encoder delay and
 * padding, so a browser decodes each file to exactly the trimmed length.
 * Interviewer Classic's open-app sound is left out: a sound when the
 * interview opens could play only sometimes, because a browser lets a page
 * play sound only after the person has interacted with it.
 *
 * Each URL is a static `new URL('./assets/<name>.mp3', import.meta.url)`, so
 * that every bundler emits every file at build time whether or not it is ever
 * played, which is what lets an installed app precache them.
 */
export const INTERACTION_SOUND_FILES = {
  'create-node': {
    url: new URL('./assets/create-node.mp3', import.meta.url).href,
  },
  'discard': { url: new URL('./assets/discard.mp3', import.meta.url).href },
  'toggle-on': {
    url: new URL('./assets/toggle-on.mp3', import.meta.url).href,
  },
  'toggle-off': {
    url: new URL('./assets/toggle-off.mp3', import.meta.url).href,
  },
  'create-edge': {
    url: new URL('./assets/create-edge.mp3', import.meta.url).href,
  },
  'drop-node': {
    url: new URL('./assets/drop-node.mp3', import.meta.url).href,
  },
  'tap-button': {
    url: new URL('./assets/tap-button.mp3', import.meta.url).href,
  },
  'error': { url: new URL('./assets/error.mp3', import.meta.url).href },
  'finish-interview': {
    url: new URL('./assets/finish-interview.mp3', import.meta.url).href,
  },
  'node-linking-mode': {
    url: new URL('./assets/node-linking-mode.mp3', import.meta.url).href,
    loop: true,
  },
} as const satisfies Record<string, { url: string; loop?: true }>;

export type InteractionSoundName = keyof typeof INTERACTION_SOUND_FILES;
