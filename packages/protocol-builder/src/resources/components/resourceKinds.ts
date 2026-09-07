import {
  createMessageError,
  defineMessages,
  type IntlShape,
  type MessageDescriptor,
} from '@codaco/app-i18n/messages';

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

/**
 * Whether a field of this picker's kind may hold that resource.
 *
 * The gateway's `kinds` option asks a host for the right resources, and the
 * contract requires an adapter to honour it — but the field's own rule is not
 * the host's to keep. An adapter that ignores the filter, or a browser left
 * open across a change, is all it takes for a descriptor of the wrong kind to
 * reach a picker, and an asset id in a field the schema does not allow it in
 * is a protocol that fails validation at best and the interview at worst.
 */
export function acceptsResourceKind(
  picker: ResourcePickerKind,
  kind: ResourceKind,
): boolean {
  return browsableKinds(picker).includes(kind);
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

/**
 * Researcher-facing names for the manifest asset types, keyed by the type
 * itself so the record stays exhaustive over the union.
 */
const kindMessages = defineMessages({
  apikey: {
    id: 'protocolBuilder.resourceKinds.apikeyLabel',
    defaultMessage: 'API key',
    description:
      'Name of the resource type that holds a map provider’s API key. Shown as a badge beside a resource in a protocol’s resource list.',
  },
  audio: {
    id: 'protocolBuilder.resourceKinds.audioLabel',
    defaultMessage: 'Audio',
    description:
      'Name of the resource type that holds an audio recording. Shown as a badge beside a resource in a protocol’s resource list.',
  },
  geojson: {
    id: 'protocolBuilder.resourceKinds.geojsonLabel',
    defaultMessage: 'Map layer',
    description:
      'Name of the resource type that holds a GeoJSON map layer. Shown as a badge beside a resource in a protocol’s resource list.',
  },
  image: {
    id: 'protocolBuilder.resourceKinds.imageLabel',
    defaultMessage: 'Image',
    description:
      'Name of the resource type that holds a picture. Shown as a badge beside a resource in a protocol’s resource list.',
  },
  network: {
    id: 'protocolBuilder.resourceKinds.networkLabel',
    defaultMessage: 'Network data',
    description:
      'Name of the resource type that holds imported participant data — a roster of people and the ties between them, in the network-research sense. Shown as a badge beside a resource in a protocol’s resource list.',
  },
  video: {
    id: 'protocolBuilder.resourceKinds.videoLabel',
    defaultMessage: 'Video',
    description:
      'Name of the resource type that holds a video. Shown as a badge beside a resource in a protocol’s resource list.',
  },
});

const statusMessages = defineMessages({
  staged: {
    id: 'protocolBuilder.resourceKinds.stagedStatus',
    defaultMessage: 'Imported, not yet saved',
    description:
      'Badge on a resource the researcher imported during this editing session, which the protocol will only hold once the stage (one step of an interview) is saved.',
  },
  committed: {
    id: 'protocolBuilder.resourceKinds.committedStatus',
    defaultMessage: 'Saved in this protocol',
    description:
      'Badge on a resource the protocol already contains, as opposed to one imported but not yet saved.',
  },
});

export function resourceKindLabel(kind: ResourceKind, intl: IntlShape): string {
  return intl.formatMessage(kindMessages[kind]);
}

export function resourceStatusLabel(
  status: 'committed' | 'staged',
  intl: IntlShape,
): string {
  return intl.formatMessage(statusMessages[status]);
}

export type ResourcePickerCopy = Readonly<{
  selectAction: MessageDescriptor;
  changeAction: MessageDescriptor;
  browserTitle: MessageDescriptor;
  browserDescription: MessageDescriptor;
  importTitle: MessageDescriptor;
}>;

/**
 * Whole sentences per kind rather than a noun dropped into a template: a
 * translated action is not the English one with a word swapped, and a picker's
 * buttons are the only place a researcher is told what this field holds.
 */
const pickerMessages = defineMessages({
  apikeySelectAction: {
    id: 'protocolBuilder.resourceKinds.apikeySelectAction',
    defaultMessage: 'Select an API key',
    description:
      'Button that opens the picker for a stage field that holds a map provider’s API key, when the field holds none yet.',
  },
  apikeyChangeAction: {
    id: 'protocolBuilder.resourceKinds.apikeyChangeAction',
    defaultMessage: 'Change the API key',
    description:
      'Button that opens the picker for a stage field that already holds an API key.',
  },
  apikeyBrowserTitle: {
    id: 'protocolBuilder.resourceKinds.apikeyBrowserTitle',
    defaultMessage: 'Choose an API key',
    description:
      'Title of the dialog where a researcher picks or adds an API key.',
  },
  apikeyBrowserDescription: {
    id: 'protocolBuilder.resourceKinds.apikeyBrowserDescription',
    defaultMessage:
      'Add an API key, or choose one already stored in this protocol.',
    description:
      'Description under the title of the dialog where a researcher picks or adds an API key.',
  },
  apikeyImportTitle: {
    id: 'protocolBuilder.resourceKinds.apikeyImportTitle',
    defaultMessage: 'Add an API key',
    description:
      'Heading over the form for adding a new API key inside the resource dialog.',
  },
  audioSelectAction: {
    id: 'protocolBuilder.resourceKinds.audioSelectAction',
    defaultMessage: 'Select an audio file',
    description:
      'Button that opens the picker for a stage field that holds an audio file, when the field holds none yet.',
  },
  audioChangeAction: {
    id: 'protocolBuilder.resourceKinds.audioChangeAction',
    defaultMessage: 'Change the audio file',
    description:
      'Button that opens the picker for a stage field that already holds an audio file.',
  },
  audioBrowserTitle: {
    id: 'protocolBuilder.resourceKinds.audioBrowserTitle',
    defaultMessage: 'Choose an audio file',
    description:
      'Title of the dialog where a researcher picks or imports an audio file.',
  },
  audioBrowserDescription: {
    id: 'protocolBuilder.resourceKinds.audioBrowserDescription',
    defaultMessage:
      'Import an audio file, or choose one already stored in this protocol.',
    description:
      'Description under the title of the dialog where a researcher picks or imports an audio file.',
  },
  audioImportTitle: {
    id: 'protocolBuilder.resourceKinds.audioImportTitle',
    defaultMessage: 'Import an audio file',
    description:
      'Heading over the file-import area for audio inside the resource dialog.',
  },
  fileSelectAction: {
    id: 'protocolBuilder.resourceKinds.fileSelectAction',
    defaultMessage: 'Select a resource',
    description:
      'Button that opens the picker for a stage field that accepts any kind of resource, when the field holds none yet.',
  },
  fileChangeAction: {
    id: 'protocolBuilder.resourceKinds.fileChangeAction',
    defaultMessage: 'Change the resource',
    description:
      'Button that opens the picker for a stage field that accepts any kind of resource and already holds one.',
  },
  fileBrowserTitle: {
    id: 'protocolBuilder.resourceKinds.fileBrowserTitle',
    defaultMessage: 'Choose a resource',
    description:
      'Title of the dialog where a researcher picks or imports a resource of any kind.',
  },
  fileBrowserDescription: {
    id: 'protocolBuilder.resourceKinds.fileBrowserDescription',
    defaultMessage:
      'Import a file, or choose a resource already stored in this protocol.',
    description:
      'Description under the title of the dialog where a researcher picks or imports a resource of any kind.',
  },
  fileImportTitle: {
    id: 'protocolBuilder.resourceKinds.fileImportTitle',
    defaultMessage: 'Import a file',
    description:
      'Heading over the file-import area for any kind of file inside the resource dialog.',
  },
  geojsonSelectAction: {
    id: 'protocolBuilder.resourceKinds.geojsonSelectAction',
    defaultMessage: 'Select a map layer',
    description:
      'Button that opens the picker for a stage field that holds a GeoJSON map layer, when the field holds none yet.',
  },
  geojsonChangeAction: {
    id: 'protocolBuilder.resourceKinds.geojsonChangeAction',
    defaultMessage: 'Change the map layer',
    description:
      'Button that opens the picker for a stage field that already holds a GeoJSON map layer.',
  },
  geojsonBrowserTitle: {
    id: 'protocolBuilder.resourceKinds.geojsonBrowserTitle',
    defaultMessage: 'Choose a map layer',
    description:
      'Title of the dialog where a researcher picks or imports a GeoJSON map layer.',
  },
  geojsonBrowserDescription: {
    id: 'protocolBuilder.resourceKinds.geojsonBrowserDescription',
    defaultMessage:
      'Import a GeoJSON map layer, or choose one already stored in this protocol.',
    description:
      'Description under the title of the dialog where a researcher picks or imports a GeoJSON map layer.',
  },
  geojsonImportTitle: {
    id: 'protocolBuilder.resourceKinds.geojsonImportTitle',
    defaultMessage: 'Import a map layer',
    description:
      'Heading over the file-import area for map layers inside the resource dialog.',
  },
  imageSelectAction: {
    id: 'protocolBuilder.resourceKinds.imageSelectAction',
    defaultMessage: 'Select an image',
    description:
      'Button that opens the picker for a stage field that holds an image, when the field holds none yet.',
  },
  imageChangeAction: {
    id: 'protocolBuilder.resourceKinds.imageChangeAction',
    defaultMessage: 'Change the image',
    description:
      'Button that opens the picker for a stage field that already holds an image.',
  },
  imageBrowserTitle: {
    id: 'protocolBuilder.resourceKinds.imageBrowserTitle',
    defaultMessage: 'Choose an image',
    description:
      'Title of the dialog where a researcher picks or imports an image.',
  },
  imageBrowserDescription: {
    id: 'protocolBuilder.resourceKinds.imageBrowserDescription',
    defaultMessage:
      'Import an image, or choose one already stored in this protocol.',
    description:
      'Description under the title of the dialog where a researcher picks or imports an image.',
  },
  imageImportTitle: {
    id: 'protocolBuilder.resourceKinds.imageImportTitle',
    defaultMessage: 'Import an image',
    description:
      'Heading over the file-import area for images inside the resource dialog.',
  },
  networkSelectAction: {
    id: 'protocolBuilder.resourceKinds.networkSelectAction',
    defaultMessage: 'Select a data file',
    description:
      'Button that opens the picker for a stage field that holds imported participant data, when the field holds none yet.',
  },
  networkChangeAction: {
    id: 'protocolBuilder.resourceKinds.networkChangeAction',
    defaultMessage: 'Change the data file',
    description:
      'Button that opens the picker for a stage field that already holds imported participant data.',
  },
  networkBrowserTitle: {
    id: 'protocolBuilder.resourceKinds.networkBrowserTitle',
    defaultMessage: 'Choose a data file',
    description:
      'Title of the dialog where a researcher picks or imports participant data (a roster).',
  },
  networkBrowserDescription: {
    id: 'protocolBuilder.resourceKinds.networkBrowserDescription',
    defaultMessage:
      'Import a CSV or JSON data file, or choose one already stored in this protocol.',
    description:
      'Description under the title of the dialog where a researcher picks or imports participant data (a roster). CSV and JSON are file formats and stay untranslated.',
  },
  networkImportTitle: {
    id: 'protocolBuilder.resourceKinds.networkImportTitle',
    defaultMessage: 'Import a data file',
    description:
      'Heading over the file-import area for participant data inside the resource dialog.',
  },
  videoSelectAction: {
    id: 'protocolBuilder.resourceKinds.videoSelectAction',
    defaultMessage: 'Select a video',
    description:
      'Button that opens the picker for a stage field that holds a video, when the field holds none yet.',
  },
  videoChangeAction: {
    id: 'protocolBuilder.resourceKinds.videoChangeAction',
    defaultMessage: 'Change the video',
    description:
      'Button that opens the picker for a stage field that already holds a video.',
  },
  videoBrowserTitle: {
    id: 'protocolBuilder.resourceKinds.videoBrowserTitle',
    defaultMessage: 'Choose a video',
    description:
      'Title of the dialog where a researcher picks or imports a video.',
  },
  videoBrowserDescription: {
    id: 'protocolBuilder.resourceKinds.videoBrowserDescription',
    defaultMessage:
      'Import a video, or choose one already stored in this protocol.',
    description:
      'Description under the title of the dialog where a researcher picks or imports a video.',
  },
  videoImportTitle: {
    id: 'protocolBuilder.resourceKinds.videoImportTitle',
    defaultMessage: 'Import a video',
    description:
      'Heading over the file-import area for videos inside the resource dialog.',
  },
});

/** The picker copy for each kind, exhaustive over the picker-kind union. */
export const RESOURCE_PICKER_COPY: Readonly<
  Record<ResourcePickerKind, ResourcePickerCopy>
> = Object.freeze({
  apikey: Object.freeze({
    selectAction: pickerMessages.apikeySelectAction,
    changeAction: pickerMessages.apikeyChangeAction,
    browserTitle: pickerMessages.apikeyBrowserTitle,
    browserDescription: pickerMessages.apikeyBrowserDescription,
    importTitle: pickerMessages.apikeyImportTitle,
  }),
  audio: Object.freeze({
    selectAction: pickerMessages.audioSelectAction,
    changeAction: pickerMessages.audioChangeAction,
    browserTitle: pickerMessages.audioBrowserTitle,
    browserDescription: pickerMessages.audioBrowserDescription,
    importTitle: pickerMessages.audioImportTitle,
  }),
  file: Object.freeze({
    selectAction: pickerMessages.fileSelectAction,
    changeAction: pickerMessages.fileChangeAction,
    browserTitle: pickerMessages.fileBrowserTitle,
    browserDescription: pickerMessages.fileBrowserDescription,
    importTitle: pickerMessages.fileImportTitle,
  }),
  geojson: Object.freeze({
    selectAction: pickerMessages.geojsonSelectAction,
    changeAction: pickerMessages.geojsonChangeAction,
    browserTitle: pickerMessages.geojsonBrowserTitle,
    browserDescription: pickerMessages.geojsonBrowserDescription,
    importTitle: pickerMessages.geojsonImportTitle,
  }),
  image: Object.freeze({
    selectAction: pickerMessages.imageSelectAction,
    changeAction: pickerMessages.imageChangeAction,
    browserTitle: pickerMessages.imageBrowserTitle,
    browserDescription: pickerMessages.imageBrowserDescription,
    importTitle: pickerMessages.imageImportTitle,
  }),
  network: Object.freeze({
    selectAction: pickerMessages.networkSelectAction,
    changeAction: pickerMessages.networkChangeAction,
    browserTitle: pickerMessages.networkBrowserTitle,
    browserDescription: pickerMessages.networkBrowserDescription,
    importTitle: pickerMessages.networkImportTitle,
  }),
  video: Object.freeze({
    selectAction: pickerMessages.videoSelectAction,
    changeAction: pickerMessages.videoChangeAction,
    browserTitle: pickerMessages.videoBrowserTitle,
    browserDescription: pickerMessages.videoBrowserDescription,
    importTitle: pickerMessages.videoImportTitle,
  }),
});

const refusalMessages = defineMessages({
  unsupportedFile: {
    id: 'protocolBuilder.resourceKinds.unsupportedFile',
    defaultMessage:
      'That file cannot be imported here. Supported file types are: {types}.',
    description:
      'Refusal shown when a researcher chooses a file this stage field cannot hold. types is the list of accepted filename extensions, already joined for the reader’s language.',
  },
  unsupportedKind: {
    id: 'protocolBuilder.resourceKinds.unsupportedKind',
    defaultMessage:
      'That resource cannot be used in this field. It accepts: {kinds}.',
    description:
      'Refusal shown when a researcher picks a stored resource of a type this stage field cannot hold. kinds is the list of resource-type names it does accept, already joined for the reader’s language.',
  },
  oversizeFile: {
    id: 'protocolBuilder.resourceKinds.oversizeFile',
    defaultMessage:
      'That file is too large to import. Files can be up to {size}.',
    description:
      'Refusal shown when a researcher chooses a file bigger than the editor will read. size is a rounded human-readable size such as "8.0 MB", already localized.',
  },
  byteLengthBytes: {
    id: 'protocolBuilder.resourceKinds.byteLengthBytes',
    defaultMessage: '{size, number} bytes',
    description:
      'A resource’s stored size when it is under one kilobyte. size is the exact byte count.',
  },
  byteLengthKilobytes: {
    id: 'protocolBuilder.resourceKinds.byteLengthKilobytes',
    defaultMessage: '{size, number, ::.0} KB',
    description:
      'A resource’s stored size in kilobytes, always to one decimal place. size is that already-rounded number; KB is the unit symbol.',
  },
  byteLengthMegabytes: {
    id: 'protocolBuilder.resourceKinds.byteLengthMegabytes',
    defaultMessage: '{size, number, ::.0} MB',
    description:
      'A resource’s stored size in megabytes, always to one decimal place. size is that already-rounded number; MB is the unit symbol.',
  },
});

/**
 * What a researcher is told when the file they chose cannot be imported.
 *
 * Encoded rather than formatted: the refusal is held in a control's state
 * until something replaces it, so it is decoded where it is rendered and
 * follows a change of language while it sits there.
 */
export function unsupportedFileMessage(kind: ResourcePickerKind): string {
  return createMessageError(refusalMessages.unsupportedFile, {
    types: { list: acceptedExtensions(kind) },
  });
}

/**
 * What a researcher is told when the resource they chose is not one this field
 * can hold. Only a host that offered it in the first place can produce this,
 * so it says what the field does accept rather than blaming the choice.
 */
export function unsupportedResourceKindMessage(
  kind: ResourcePickerKind,
): string {
  return createMessageError(refusalMessages.unsupportedKind, {
    kinds: {
      list: browsableKinds(kind).map((accepted) => ({
        messageError: createMessageError(kindMessages[accepted]),
      })),
    },
  });
}

/**
 * What a researcher is told when the file they chose is too big to import.
 * One sentence with the limit in it, so it can be translated whole.
 */
export function oversizeFileMessage(maxByteLength: number): string {
  const size = byteLengthMessage(maxByteLength);
  return createMessageError(refusalMessages.oversizeFile, {
    size: { messageError: createMessageError(size.message, size.values) },
  });
}

/**
 * The descriptor and value that say how big a resource's content is.
 *
 * The rounding stays here rather than moving into ICU: `toFixed(1)` is what
 * decides `2.0 KB` rather than `1.953 KB`, and the `::.0` skeleton on each
 * message is only what keeps the trailing zero once it has.
 */
function byteLengthMessage(byteLength: number): Readonly<{
  message: MessageDescriptor;
  values: Readonly<{ size: number }>;
}> {
  if (byteLength < 1024) {
    return {
      message: refusalMessages.byteLengthBytes,
      values: { size: byteLength },
    };
  }
  if (byteLength < 1024 * 1024) {
    return {
      message: refusalMessages.byteLengthKilobytes,
      values: { size: Number((byteLength / 1024).toFixed(1)) },
    };
  }
  return {
    message: refusalMessages.byteLengthMegabytes,
    values: { size: Number((byteLength / (1024 * 1024)).toFixed(1)) },
  };
}

/** Human-readable size for a resource's stored content. */
export function formatByteLength(byteLength: number, intl: IntlShape): string {
  const { message, values } = byteLengthMessage(byteLength);
  return intl.formatMessage(message, values);
}
