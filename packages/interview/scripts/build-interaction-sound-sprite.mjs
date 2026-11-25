#!/usr/bin/env node
/**
 * Builds the interview's interaction-sound sprite from Interviewer Classic's
 * sound files, which stay as they are.
 *
 * Each sound is trimmed so that it starts at its first audible sample (a sound
 * that starts late sounds late) and ends at its last, with a short fade so the
 * cut does not click. The sounds are then joined, with a short silence between
 * them, into one WAV file that the interview fetches and decodes once, and a
 * TypeScript module gives each sound's start and duration in that file.
 *
 * Plain Node: the WAV files are 16-bit PCM, read and written here directly.
 *
 *   node scripts/build-interaction-sound-sprite.mjs
 *
 * Writes src/sounds/interaction-sounds.wav and
 * src/sounds/interactionSoundSprite.ts.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const sourceDir = resolve(
  here,
  '../../../apps/interviewer-classic/src/interaction-sounds',
);
const outDir = resolve(here, '../src/sounds');
const spritePath = resolve(outDir, 'interaction-sounds.wav');
const mapPath = resolve(outDir, 'interactionSoundSprite.ts');

/**
 * The sounds in the sprite, in order. open-app.wav is left out: a sound when
 * the interview opens could play only sometimes, because a browser lets a page
 * play sound only after the person has interacted with it.
 *
 * The linking sound loops. Its trailing silence is part of its rhythm, so it
 * keeps its full length after the leading silence is trimmed.
 */
const SOUNDS = [
  { name: 'create-node', file: 'create-node.wav' },
  { name: 'discard', file: 'discard.wav' },
  { name: 'toggle-on', file: 'toggle-on.wav' },
  { name: 'toggle-off', file: 'toggle-off.wav' },
  { name: 'create-edge', file: 'create-edge.wav' },
  { name: 'drop-node', file: 'drop-node.wav' },
  { name: 'tap-button', file: 'tap-button.wav' },
  { name: 'error', file: 'error.wav' },
  { name: 'finish-interview', file: 'finish-interview.wav' },
  { name: 'node-linking-mode', file: 'node-linking-mode.wav', loop: true },
];

/** Quieter than this (dBFS) counts as silence when trimming. */
const SILENCE_DBFS = -50;
/** Kept before the first audible sample, so the attack is not clipped. */
const PRE_ROLL_SECONDS = 0.001;
/** Faded out after the last audible sample. */
const FADE_OUT_SECONDS = 0.005;
/** Silence between sounds in the sprite. */
const GAP_SECONDS = 0.05;

function readChunks(buffer) {
  if (
    buffer.toString('ascii', 0, 4) !== 'RIFF' ||
    buffer.toString('ascii', 8, 12) !== 'WAVE'
  ) {
    throw new Error('Not a RIFF/WAVE file');
  }
  const chunks = new Map();
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    chunks.set(id, buffer.subarray(offset + 8, offset + 8 + size));
    offset += 8 + size + (size % 2);
  }
  return chunks;
}

/** Reads a 16-bit PCM WAV file into one Int16Array per channel. */
function readWav(path) {
  const chunks = readChunks(readFileSync(path));
  const fmt = chunks.get('fmt ');
  const data = chunks.get('data');
  if (!fmt || !data) throw new Error(`${path}: missing fmt or data chunk`);
  const format = fmt.readUInt16LE(0);
  const channelCount = fmt.readUInt16LE(2);
  const sampleRate = fmt.readUInt32LE(4);
  const bitsPerSample = fmt.readUInt16LE(14);
  if (format !== 1 || bitsPerSample !== 16) {
    throw new Error(`${path}: only 16-bit PCM is supported`);
  }
  const frameCount = Math.floor(data.length / (2 * channelCount));
  const channels = Array.from(
    { length: channelCount },
    () => new Int16Array(frameCount),
  );
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      channels[channel][frame] = data.readInt16LE(
        (frame * channelCount + channel) * 2,
      );
    }
  }
  return { sampleRate, channels, frameCount };
}

function writeWav(path, sampleRate, channels) {
  const channelCount = channels.length;
  const frameCount = channels[0].length;
  const dataSize = frameCount * channelCount * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channelCount, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channelCount * 2, 28);
  buffer.writeUInt16LE(channelCount * 2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataSize, 40);
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      buffer.writeInt16LE(
        channels[channel][frame],
        44 + (frame * channelCount + channel) * 2,
      );
    }
  }
  writeFileSync(path, buffer);
  return buffer.length;
}

const threshold = 32768 * 10 ** (SILENCE_DBFS / 20);
const isAudible = (channels, frame) =>
  channels.some((channel) => Math.abs(channel[frame]) > threshold);

const sources = SOUNDS.map((sound) => ({
  ...sound,
  ...readWav(resolve(sourceDir, sound.file)),
}));

const sampleRate = sources[0].sampleRate;
const sourceChannelCount = sources[0].channels.length;
for (const source of sources) {
  if (
    source.sampleRate !== sampleRate ||
    source.channels.length !== sourceChannelCount
  ) {
    throw new Error(`${source.file}: sample rate or channel count differs`);
  }
}

// Stereo files whose channels are the same carry no stereo information, and
// one channel halves the sprite.
const channelsIdentical =
  sourceChannelCount === 2 &&
  sources.every(({ channels: [left, right] }) =>
    left.every((sample, index) => sample === right[index]),
  );
const outputChannelCount = channelsIdentical ? 1 : sourceChannelCount;

const preRoll = Math.round(PRE_ROLL_SECONDS * sampleRate);
const fadeLength = Math.round(FADE_OUT_SECONDS * sampleRate);
const gapLength = Math.round(GAP_SECONDS * sampleRate);

const trimmed = sources.map((source) => {
  const { channels, frameCount } = source;
  let first = 0;
  while (first < frameCount && !isAudible(channels, first)) first += 1;
  let last = frameCount - 1;
  while (last > first && !isAudible(channels, last)) last -= 1;
  if (first >= frameCount) throw new Error(`${source.file} is silent`);

  const start = Math.max(0, first - preRoll);
  const end = source.loop
    ? frameCount
    : Math.min(frameCount, last + 1 + fadeLength);
  const kept = channels
    .slice(0, outputChannelCount)
    .map((channel) => Int16Array.from(channel.subarray(start, end)));
  if (!source.loop) {
    const length = end - start;
    const fadeFrom = Math.max(0, length - fadeLength);
    for (const channel of kept) {
      for (let frame = fadeFrom; frame < length; frame += 1) {
        const gain = (length - frame) / (length - fadeFrom + 1);
        channel[frame] = Math.round(channel[frame] * gain);
      }
    }
  }
  return {
    name: source.name,
    loop: source.loop === true,
    channels: kept,
    trimmedLeading: start / sampleRate,
    trimmedTrailing: (frameCount - end) / sampleRate,
  };
});

const totalFrames = trimmed.reduce(
  (sum, sound, index) =>
    sum + sound.channels[0].length + (index > 0 ? gapLength : 0),
  0,
);
const sprite = Array.from(
  { length: outputChannelCount },
  () => new Int16Array(totalFrames),
);
const entries = [];
let cursor = 0;
trimmed.forEach((sound, index) => {
  if (index > 0) cursor += gapLength;
  const length = sound.channels[0].length;
  sound.channels.forEach((channel, channelIndex) =>
    sprite[channelIndex].set(channel, cursor),
  );
  entries.push({
    name: sound.name,
    start: cursor / sampleRate,
    duration: length / sampleRate,
    loop: sound.loop,
  });
  cursor += length;
});

const bytes = writeWav(spritePath, sampleRate, sprite);

const round = (seconds) => Number(seconds.toFixed(6));
const key = (name) => `'${name}'`;
const mapSource = `// Generated by scripts/build-interaction-sound-sprite.mjs. Do not edit by hand:
// run \`node scripts/build-interaction-sound-sprite.mjs\` from packages/interview.

/**
 * Where each sound starts in interaction-sounds.wav, and how long it lasts, in
 * seconds. A looping sound repeats that span.
 */
export const INTERACTION_SOUND_SPRITE = {
${entries
  .map(
    (entry) =>
      `  ${key(entry.name)}: { start: ${round(entry.start)}, duration: ${round(entry.duration)}${entry.loop ? ', loop: true' : ''} },`,
  )
  .join('\n')}
} as const satisfies Record<
  string,
  { start: number; duration: number; loop?: true }
>;

export type InteractionSoundName = keyof typeof INTERACTION_SOUND_SPRITE;
`;
writeFileSync(mapPath, mapSource);

console.log(
  `Sprite: ${spritePath} (${bytes} bytes, ${(totalFrames / sampleRate).toFixed(3)} s, ${sampleRate} Hz, ${outputChannelCount} channel${outputChannelCount === 1 ? '' : 's'}${channelsIdentical ? '; the source channels were identical' : ''})`,
);
for (const sound of trimmed) {
  const entry = entries.find((candidate) => candidate.name === sound.name);
  console.log(
    `  ${sound.name}: ${entry.duration.toFixed(3)} s (trimmed ${(sound.trimmedLeading * 1000).toFixed(1)} ms before, ${(sound.trimmedTrailing * 1000).toFixed(1)} ms after)`,
  );
}
