import type { ResourceContentKind, ResourceKind } from '../gateway.ts';

/**
 * What one picker offers.
 *
 * `file` is the untyped picker: a field that accepts any stored resource
 * browses every content kind, and works out which kind an imported file is
 * from its extension — the same thing Architect's own file field does when a
 * call site names no type.
 */
export type ResourcePickerKind = ResourceKind | 'file';

/** Kinds whose content an editor can render as media. */
export type PreviewableResourceKind = 'audio' | 'image' | 'video';

/**
 * The extensions each content kind accepts, matching what Architect imports
 * today. A roster is a `network` resource whether it arrives as CSV or JSON.
 */
export const RESOURCE_KIND_EXTENSIONS: Readonly<
  Record<ResourceContentKind, readonly string[]>
> = Object.freeze({
  audio: Object.freeze(['.mp3', '.aiff', '.m4a']),
  geojson: Object.freeze(['.geojson']),
  image: Object.freeze(['.jpg', '.jpeg', '.gif', '.png', '.svg']),
  network: Object.freeze(['.csv', '.json']),
  video: Object.freeze(['.mov', '.mp4']),
});

const EXTENSION_CONTENT_TYPES: Readonly<Record<string, string>> = Object.freeze(
  {
    '.aiff': 'audio/aiff',
    '.csv': 'text/csv',
    '.geojson': 'application/geo+json',
    '.gif': 'image/gif',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.json': 'application/json',
    '.m4a': 'audio/mp4',
    '.mov': 'video/quicktime',
    '.mp3': 'audio/mpeg',
    '.mp4': 'video/mp4',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
  },
);

/** The order the untyped picker resolves an extension in. */
const CONTENT_KINDS: readonly ResourceContentKind[] = Object.freeze([
  'image',
  'video',
  'audio',
  'network',
  'geojson',
]);

const PREVIEWABLE_KINDS: ReadonlySet<string> = new Set([
  'audio',
  'image',
  'video',
]);

export function isPreviewableKind(
  kind: ResourceKind,
): kind is PreviewableResourceKind {
  return PREVIEWABLE_KINDS.has(kind);
}

/** The manifest kinds a picker of this kind may show. */
export function browsableKinds(
  kind: ResourcePickerKind,
): readonly ResourceKind[] {
  return kind === 'file' ? CONTENT_KINDS : Object.freeze([kind]);
}

/** Lowercased `.ext`, or an empty string for a name that carries none. */
export function fileExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot <= 0 ? '' : filename.slice(dot).toLowerCase();
}

/** Extensions this picker will import; empty for the secret picker. */
export function acceptedExtensions(
  kind: ResourcePickerKind,
): readonly string[] {
  if (kind === 'apikey') return Object.freeze([]);
  if (kind === 'file') {
    return Object.freeze(
      CONTENT_KINDS.flatMap((k) => RESOURCE_KIND_EXTENSIONS[k]),
    );
  }
  return RESOURCE_KIND_EXTENSIONS[kind];
}

/**
 * The kind a chosen file would be staged as, or `undefined` when this picker
 * does not accept it. A typed picker only accepts its own kind's extensions;
 * the untyped one accepts anything the manifest has a kind for.
 */
export function contentKindForFile(
  kind: ResourcePickerKind,
  filename: string,
): ResourceContentKind | undefined {
  const extension = fileExtension(filename);
  if (extension === '') return undefined;
  const match = CONTENT_KINDS.find((candidate) =>
    RESOURCE_KIND_EXTENSIONS[candidate].includes(extension),
  );
  if (match === undefined) return undefined;
  if (kind === 'file') return match;
  return match === kind ? match : undefined;
}

/**
 * The media type to record for a chosen file. The browser's own is preferred;
 * the extension is the fallback, because a CSV or GeoJSON file frequently
 * arrives with an empty type.
 */
export function contentTypeForFile(
  filename: string,
  reportedType: string,
): string {
  if (reportedType !== '') return reportedType;
  return (
    EXTENSION_CONTENT_TYPES[fileExtension(filename)] ??
    'application/octet-stream'
  );
}

/** Filename for the manifest's `source`, with any path the host reported. */
export function sourceFilename(filename: string): string {
  return filename.split(/[/\\]/).at(-1) ?? filename;
}

const RESOURCE_KIND_LABELS: Readonly<Record<ResourceKind, string>> =
  Object.freeze({
    apikey: 'API key',
    audio: 'Audio',
    geojson: 'Map layer',
    image: 'Image',
    network: 'Network data',
    video: 'Video',
  });

export function resourceKindLabel(kind: ResourceKind): string {
  return RESOURCE_KIND_LABELS[kind];
}

export function resourceStatusLabel(status: 'committed' | 'staged'): string {
  return status === 'staged'
    ? 'Imported, not yet saved'
    : 'Saved in this protocol';
}

export type ResourcePickerCopy = Readonly<{
  selectAction: string;
  changeAction: string;
  browserTitle: string;
  browserDescription: string;
  importTitle: string;
}>;

/**
 * Whole sentences per kind rather than a noun dropped into a template: a
 * translated action is not the English one with a word swapped, and a picker's
 * buttons are the only place a researcher is told what this field holds.
 */
export const RESOURCE_PICKER_COPY: Readonly<
  Record<ResourcePickerKind, ResourcePickerCopy>
> = Object.freeze({
  apikey: Object.freeze({
    selectAction: 'Select an API key',
    changeAction: 'Change the API key',
    browserTitle: 'Choose an API key',
    browserDescription:
      'Add an API key, or choose one already stored in this protocol.',
    importTitle: 'Add an API key',
  }),
  audio: Object.freeze({
    selectAction: 'Select an audio file',
    changeAction: 'Change the audio file',
    browserTitle: 'Choose an audio file',
    browserDescription:
      'Import an audio file, or choose one already stored in this protocol.',
    importTitle: 'Import an audio file',
  }),
  file: Object.freeze({
    selectAction: 'Select a resource',
    changeAction: 'Change the resource',
    browserTitle: 'Choose a resource',
    browserDescription:
      'Import a file, or choose a resource already stored in this protocol.',
    importTitle: 'Import a file',
  }),
  geojson: Object.freeze({
    selectAction: 'Select a map layer',
    changeAction: 'Change the map layer',
    browserTitle: 'Choose a map layer',
    browserDescription:
      'Import a GeoJSON map layer, or choose one already stored in this protocol.',
    importTitle: 'Import a map layer',
  }),
  image: Object.freeze({
    selectAction: 'Select an image',
    changeAction: 'Change the image',
    browserTitle: 'Choose an image',
    browserDescription:
      'Import an image, or choose one already stored in this protocol.',
    importTitle: 'Import an image',
  }),
  network: Object.freeze({
    selectAction: 'Select a data file',
    changeAction: 'Change the data file',
    browserTitle: 'Choose a data file',
    browserDescription:
      'Import a CSV or JSON data file, or choose one already stored in this protocol.',
    importTitle: 'Import a data file',
  }),
  video: Object.freeze({
    selectAction: 'Select a video',
    changeAction: 'Change the video',
    browserTitle: 'Choose a video',
    browserDescription:
      'Import a video, or choose one already stored in this protocol.',
    importTitle: 'Import a video',
  }),
});

/** What a researcher is told when the file they chose cannot be imported. */
export function unsupportedFileMessage(kind: ResourcePickerKind): string {
  const accepted = acceptedExtensions(kind);
  return `That file cannot be imported here. Supported file types are: ${accepted.join(', ')}.`;
}

/**
 * What a researcher is told when the file they chose is too big to import.
 * One sentence with the limit in it, so it can be translated whole.
 */
export function oversizeFileMessage(maxByteLength: number): string {
  return `That file is too large to import. Files can be up to ${formatByteLength(maxByteLength)}.`;
}

/** Human-readable size for a resource's stored content. */
export function formatByteLength(byteLength: number): string {
  if (byteLength < 1024) return `${byteLength} bytes`;
  if (byteLength < 1024 * 1024) return `${(byteLength / 1024).toFixed(1)} KB`;
  return `${(byteLength / (1024 * 1024)).toFixed(1)} MB`;
}
