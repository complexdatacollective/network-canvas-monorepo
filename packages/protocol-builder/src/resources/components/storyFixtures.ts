import type { ProtocolBuilderClient } from '@codaco/protocol-builder-core/contract';
import type { StageType } from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import {
  sectionId,
  type ProtocolSectionId,
} from '@codaco/studio-sync/taxonomy';

import { createInMemoryHost } from '../../testing/host/createInMemoryHost.ts';
import type { ResourceKind, ResourceSecretStorage } from '../types.ts';

/**
 * The resources every resource-picker story is told the protocol already
 * holds, and the file its import stories drop into it.
 *
 * One set, shared by the picker, the file import, the API key control and the
 * preview, so the four surfaces of the same feature show the same protocol.
 * Deliberately one of each thing a picker can be pointed at: an image, a
 * video, an audio file, a roster, and a key.
 */
export type StoryResource = Readonly<{
  id: string;
  kind: ResourceKind;
  name: string;
  /** The filename the manifest records, and what the bytes are filed under. */
  source?: string;
  contentType?: string;
  bytes?: string;
  /** A secret's value, which the manifest keeps and no editor ever reads. */
  value?: string;
}>;

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

/** A roster of the shape a researcher imports one as. */
const COMMUNITY_ROSTER = JSON.stringify({
  nodes: [
    { attributes: { name: 'Ada', age: 36, neighbourhood: 'Riverside' } },
    { attributes: { name: 'Grace', age: 41, neighbourhood: 'Old Town' } },
    { attributes: { name: 'Katherine', age: 29, neighbourhood: 'Riverside' } },
  ],
  edges: [{ from: 0, to: 1 }],
});

export const IMAGE_RESOURCE: StoryResource = Object.freeze({
  kind: 'image',
  id: 'image-1',
  name: 'Neighbourhood photo',
  source: 'neighbourhood.svg',
  contentType: 'image/svg+xml',
  bytes: NEIGHBOURHOOD_SVG,
});

/**
 * Playable media is not something a fixture can carry: an mp4 short enough to
 * write here is not an mp4 at all. The video and audio stories therefore show
 * a real player over content that will not decode, which is exactly what the
 * preview renders — the element, its controls, and the resource's name as its
 * accessible name — and is the part those stories are about.
 */
export const VIDEO_RESOURCE: StoryResource = Object.freeze({
  kind: 'video',
  id: 'video-1',
  name: 'Interview walkthrough',
  source: 'walkthrough.mp4',
  contentType: 'video/mp4',
  bytes: 'not-a-real-mp4',
});

export const AUDIO_RESOURCE: StoryResource = Object.freeze({
  kind: 'audio',
  id: 'audio-1',
  name: 'Spoken instructions',
  source: 'instructions.mp3',
  contentType: 'audio/mpeg',
  bytes: 'not-a-real-mp3',
});

export const ROSTER_RESOURCE: StoryResource = Object.freeze({
  kind: 'network',
  id: 'network-1',
  name: 'Community roster',
  source: 'community.json',
  contentType: 'application/json',
  bytes: COMMUNITY_ROSTER,
});

/**
 * A key the protocol already holds. Its value is here because the host is the
 * thing that keeps it; nothing in an editor ever reads it, which is what the
 * API key stories are showing.
 */
export const API_KEY_RESOURCE: StoryResource = Object.freeze({
  kind: 'apikey',
  id: 'apikey-1',
  name: 'Mapbox key',
  value: 'pk.eyJ1Ijoic3Rvcnlib29rIiwiYSI6ImZpeHR1cmUifQ',
});

/** Everything above, as one protocol's committed resources. */
export const PROTOCOL_RESOURCES: readonly StoryResource[] = Object.freeze([
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

/** The stage a picker story's field belongs to. */
export type StoryStage = Readonly<{
  stageId: string;
  type: StageType;
  fields: SectionDoc;
}>;

export type StoryHostOptions = Readonly<{
  resources?: readonly StoryResource[];
  stage?: StoryStage;
  /**
   * A procedure this host answers `failed` to. `forever` because a story is a
   * state a researcher is looking at, and a host that refuses once and then
   * behaves does not hold that state still — including when they use the retry
   * it offers.
   */
  refuses?: Readonly<{
    procedure: 'stage' | 'preview' | 'inspect';
    forever?: boolean;
  }>;
  /** Where this host says a promoted secret's value comes to rest. */
  secretStorage?: ResourceSecretStorage;
}>;

export type StoryHost = Readonly<{
  client: ProtocolBuilderClient;
  protocolId: string;
  /** The stage section a picker story's editor opens. */
  sectionId: ProtocolSectionId;
  /** Takes the stage for somebody else, so the story opens read-only. */
  takeTheStage: () => void;
}>;

const DEFAULT_STAGE: StoryStage = {
  stageId: 'welcome-screen',
  type: 'Information',
  fields: { label: 'Welcome', title: 'Welcome to the study', items: [] },
};

const REFUSAL = {
  status: 'failed' as const,
  failure: {
    reason: 'unavailable' as const,
    message: 'the resource host is temporarily unavailable',
    retryable: true,
  },
};

/**
 * The contract, served from memory, over the protocol these stories are about.
 *
 * Built once per story so a control changed after the story has rendered does
 * not reopen it: a host is a thing an application supplies, not a prop.
 */
export function createStoryHost(options: StoryHostOptions = {}): StoryHost {
  const resources = options.resources ?? PROTOCOL_RESOURCES;
  const stage = options.stage ?? DEFAULT_STAGE;
  const stageSection = sectionId({ kind: 'stage', stageId: stage.stageId });
  const assets: Record<string, unknown> = {};
  const assetContent: Record<string, Blob> = {};
  const contentTypes = new Map<string, string>();

  for (const resource of resources) {
    assets[resource.id] = {
      type: resource.kind,
      name: resource.name,
      ...(resource.source === undefined ? {} : { source: resource.source }),
      ...(resource.value === undefined ? {} : { value: resource.value }),
    };
    if (resource.contentType !== undefined) {
      contentTypes.set(resource.id, resource.contentType);
    }
    if (resource.source !== undefined && resource.bytes !== undefined) {
      assetContent[resource.source] = new Blob([resource.bytes], {
        type: resource.contentType ?? 'application/octet-stream',
      });
    }
  }

  const host = createInMemoryHost({
    nextId: sequentialIds(),
    assetContent,
    sections: {
      [sectionId({ kind: 'settings' })]: {
        name: 'Resource picker proof host',
        schemaVersion: 8,
      },
      [sectionId({ kind: 'stageOrder' })]: { stages: [stage.stageId] },
      [stageSection]: { id: stage.stageId, type: stage.type, ...stage.fields },
      [sectionId({ kind: 'assets' })]: assets,
      [sectionId({ kind: 'codebookNode', typeId: 'person' })]: {
        name: 'Person',
        color: 'node-color-seq-1',
        shape: { default: 'circle' },
        variables: {},
      },
    },
  });

  let refusals = 0;
  const refuses = (procedure: 'stage' | 'preview' | 'inspect'): boolean => {
    if (options.refuses?.procedure !== procedure) return false;
    if (options.refuses.forever === true) return true;
    refusals += 1;
    return refusals === 1;
  };

  const listing: ProtocolBuilderClient['resources']['list'] = async (input) => {
    const listed = await host.client.resources.list(input);
    if (listed.status !== 'ok' || options.secretStorage === undefined) {
      return listed;
    }
    return {
      status: 'ok' as const,
      data: { ...listed.data, secretStorage: options.secretStorage },
    };
  };

  /**
   * `preview` also re-states the content type. A manifest entry records a
   * resource's name, kind and filename and not its media type, so the
   * in-memory host serves a committed resource as `application/octet-stream`,
   * which no browser will draw. A real host knows what it stored, and so does
   * this one.
   */
  const previewing: ProtocolBuilderClient['resources']['preview'] = async (
    input,
  ) => {
    if (refuses('preview')) return REFUSAL;
    const resolved = await host.client.resources.preview(input);
    const contentType = contentTypes.get(input.resourceId);
    if (resolved.status !== 'ok' || contentType === undefined) return resolved;
    return {
      status: 'ok' as const,
      data: {
        ...resolved.data,
        url: resolved.data.url.replace(
          'data:application/octet-stream;',
          `data:${contentType};`,
        ),
      },
    };
  };

  const staging: ProtocolBuilderClient['resources']['stage'] = (input) =>
    refuses('stage')
      ? Promise.resolve(REFUSAL)
      : host.client.resources.stage(input);

  const inspecting: ProtocolBuilderClient['resources']['inspect'] = (input) =>
    refuses('inspect')
      ? Promise.resolve(REFUSAL)
      : host.client.resources.inspect(input);

  // Proxied rather than spread: a contract client's procedures are reached
  // through property access rather than held as own properties.
  const storyResources = new Proxy(host.client.resources, {
    get: (target, property, receiver) => {
      if (property === 'list') return listing;
      if (property === 'preview') return previewing;
      if (property === 'stage') return staging;
      if (property === 'inspect') return inspecting;
      return Reflect.get(target, property, receiver);
    },
  });

  const client = new Proxy(host.client, {
    get: (target, property, receiver) =>
      property === 'resources'
        ? storyResources
        : Reflect.get(target, property, receiver),
  });

  return {
    client,
    protocolId: host.protocolId,
    sectionId: stageSection,
    takeTheStage: () => {
      void host
        .asCollaborator({
          sessionId: 'session-2',
          userId: 'user-2',
          displayName: 'Grace',
        })
        .acquireLock({ protocolId: host.protocolId, sectionId: stageSection });
    },
  };
}

/** Ids the host mints, numbered so a story can name what an import produced. */
function sequentialIds(): () => string {
  let issued = 0;
  return () => {
    issued += 1;
    return `staged-resource-${issued}`;
  };
}
