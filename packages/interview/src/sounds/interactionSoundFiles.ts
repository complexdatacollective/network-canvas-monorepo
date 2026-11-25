/**
 * The interview's interaction sounds: the MP3 file each plays, the rate it
 * plays the file at, and whether it repeats until it is stopped.
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
 * play sound only after the person has interacted with it. Its create-node
 * sound is left out too (see `create-node` below).
 *
 * Two sounds play another sound's file at a different `rate` (a playback
 * rate, so a pitch: 1.5 is a perfect fifth up, 0.75 a perfect fourth down),
 * and the file is fetched and decoded once for both:
 *
 * - `pick-up`, picking a person up to drag them, is `tap-button` a fifth up.
 *   Played as it is, the tap is lower than every sound a drop can make, so a
 *   drag would rise from the pick-up to the drop; a fifth up puts the pick-up
 *   above them all, so it falls instead, as an item that is put down does.
 * - `create-node`, adding a person, is `create-edge` a fourth down: adding a
 *   person sounds like a deeper version of connecting two people.
 *
 * Each URL is a static `new URL('./assets/<name>.mp3', import.meta.url)`, so
 * that every bundler emits every file at build time whether or not it is ever
 * played, which is what lets an installed app precache them.
 */
const CREATE_EDGE_URL = new URL('./assets/create-edge.mp3', import.meta.url)
  .href;
const TAP_BUTTON_URL = new URL('./assets/tap-button.mp3', import.meta.url).href;

export const INTERACTION_SOUND_FILES = {
  'create-node': { url: CREATE_EDGE_URL, rate: 0.75 },
  'discard': { url: new URL('./assets/discard.mp3', import.meta.url).href },
  'toggle-on': {
    url: new URL('./assets/toggle-on.mp3', import.meta.url).href,
  },
  'toggle-off': {
    url: new URL('./assets/toggle-off.mp3', import.meta.url).href,
  },
  'create-edge': { url: CREATE_EDGE_URL },
  'drop-node': {
    url: new URL('./assets/drop-node.mp3', import.meta.url).href,
  },
  'tap-button': { url: TAP_BUTTON_URL },
  'pick-up': { url: TAP_BUTTON_URL, rate: 1.5 },
  'error': { url: new URL('./assets/error.mp3', import.meta.url).href },
  'finish-interview': {
    url: new URL('./assets/finish-interview.mp3', import.meta.url).href,
  },
  'node-linking-mode': {
    url: new URL('./assets/node-linking-mode.mp3', import.meta.url).href,
    loop: true,
  },
} as const satisfies Record<
  string,
  { url: string; rate?: number; loop?: true }
>;

export type InteractionSoundName = keyof typeof INTERACTION_SOUND_FILES;
