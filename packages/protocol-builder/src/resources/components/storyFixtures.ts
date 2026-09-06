import type { InMemoryResourceSeed } from '../InMemoryResourceGateway.ts';

/**
 * The resources every resource-picker story is told the protocol already
 * holds, and the file its import stories drop into it.
 *
 * One set, shared by the picker, the file import, the API key control and the
 * preview, so the four surfaces of the same feature show the same protocol.
 * Deliberately one of each thing a picker can be pointed at: an image, a
 * video, an audio file, a roster the host can read, and a key.
 */
const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

/**
 * A real picture rather than a placeholder string.
 *
 * The preview renders whatever bytes the host is holding, so a fixture that is
 * not actually decodable shows a broken image in every story that reaches a
 * preview. SVG is the one image format that stays readable as source while
 * still being something an `img` element can draw.
 */
const NEIGHBOURHOOD_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 160">
  <rect width="240" height="160" fill="#22304a" />
  <circle cx="196" cy="38" r="18" fill="#f2d16b" />
  <path d="M0 118 L58 76 L106 116 L154 72 L240 130 L240 160 L0 160 Z" fill="#3f7d6b" />
  <rect x="86" y="94" width="36" height="42" fill="#d9d2c5" />
  <rect x="97" y="106" width="14" height="12" fill="#22304a" />
</svg>
`;

/**
 * A roster the in-memory host can read, so the summary a researcher chooses a
 * data file on — how many entries it holds, which attributes it carries — is
 * the host's own reading of these bytes rather than a fact the story asserts.
 */
const COMMUNITY_ROSTER = JSON.stringify({
  nodes: [
    { attributes: { name: 'Ada', age: 36, neighbourhood: 'Riverside' } },
    { attributes: { name: 'Grace', age: 41, neighbourhood: 'Old Town' } },
    { attributes: { name: 'Katherine', age: 29, neighbourhood: 'Riverside' } },
  ],
  edges: [{ from: 0, to: 1 }],
});

export const IMAGE_RESOURCE: InMemoryResourceSeed = Object.freeze({
  kind: 'image',
  id: 'image-1',
  name: 'Neighbourhood photo',
  source: 'neighbourhood.svg',
  contentType: 'image/svg+xml',
  bytes: encode(NEIGHBOURHOOD_SVG),
});

/**
 * Playable media is not something a fixture can carry: an mp4 short enough to
 * write here is not an mp4 at all. The video and audio stories therefore show
 * a real player over content that will not decode, which is exactly what the
 * preview renders — the element, its controls, and the resource's name as its
 * accessible name — and is the part those stories are about.
 */
export const VIDEO_RESOURCE: InMemoryResourceSeed = Object.freeze({
  kind: 'video',
  id: 'video-1',
  name: 'Interview walkthrough',
  source: 'walkthrough.mp4',
  contentType: 'video/mp4',
  bytes: encode('not-a-real-mp4'),
});

export const AUDIO_RESOURCE: InMemoryResourceSeed = Object.freeze({
  kind: 'audio',
  id: 'audio-1',
  name: 'Spoken instructions',
  source: 'instructions.mp3',
  contentType: 'audio/mpeg',
  bytes: encode('not-a-real-mp3'),
});

export const ROSTER_RESOURCE: InMemoryResourceSeed = Object.freeze({
  kind: 'network',
  id: 'network-1',
  name: 'Community roster',
  source: 'community.json',
  contentType: 'application/json',
  bytes: encode(COMMUNITY_ROSTER),
});

/**
 * A key the protocol already holds. Its value is here because the in-memory
 * host is the thing that keeps it; nothing in an editor ever reads it, which
 * is what the API key stories are showing.
 */
export const API_KEY_RESOURCE: InMemoryResourceSeed = Object.freeze({
  kind: 'apikey',
  id: 'apikey-1',
  name: 'Mapbox key',
  value: 'pk.eyJ1Ijoic3Rvcnlib29rIiwiYSI6ImZpeHR1cmUifQ',
});

/** Everything above, as one protocol's committed resources. */
export const PROTOCOL_RESOURCES: readonly InMemoryResourceSeed[] =
  Object.freeze([
    IMAGE_RESOURCE,
    VIDEO_RESOURCE,
    AUDIO_RESOURCE,
    ROSTER_RESOURCE,
    API_KEY_RESOURCE,
  ]);

/**
 * The file an import story drops on the control. A fresh `File` per call: a
 * play reads it, and a play may run more than once in one page.
 */
export function skylineImageFile(): File {
  return new File([NEIGHBOURHOOD_SVG], 'skyline.svg', {
    type: 'image/svg+xml',
  });
}

/** A file no picker in these stories will accept. */
export function fieldNotesFile(): File {
  return new File(['Ada lives by the river.'], 'field-notes.txt', {
    type: 'text/plain',
  });
}
