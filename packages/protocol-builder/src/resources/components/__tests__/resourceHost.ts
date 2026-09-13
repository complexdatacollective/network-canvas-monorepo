import type { ProtocolBuilderClient } from '@codaco/protocol-builder-core/contract';
import type { StageType } from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import {
  createInMemoryHost,
  type InMemoryHost,
} from '../../../testing/host/createInMemoryHost.ts';
import type { ResourceDescriptor, ResourceKind } from '../../types.ts';

export const STAGE_SECTION = sectionId({ kind: 'stage', stageId: 'stage-1' });
const ASSETS_SECTION = sectionId({ kind: 'assets' });

/**
 * One resource the protocol already holds, as a test says it.
 *
 * `source` and `bytes` are what a content resource is: the filename the
 * manifest records, and the file itself, which the host serves back from
 * `preview`. A secret has neither — nothing ever hands its value back — so it
 * carries only the value the manifest stores.
 */
export type CommittedResource = Readonly<{
  id: string;
  kind: ResourceKind;
  name: string;
  source?: string;
  bytes?: string;
  value?: string;
}>;

/**
 * Ids the host mints, numbered rather than random, so a test can name the
 * resource an import produced.
 */
function sequentialIds(prefix = 'staged-resource'): () => string {
  let issued = 0;
  return () => {
    issued += 1;
    return `${prefix}-${issued}`;
  };
}

/**
 * A complete Information stage, so a test that saves is saving something the
 * protocol schema accepts. The shell refuses to submit a draft the schema
 * rejects, so an incomplete seed would make every save look like a save that
 * was never attempted.
 */
const DEFAULT_INFORMATION_FIELDS: SectionDoc = {
  label: 'Welcome',
  title: 'Welcome',
  items: [],
};

export type ResourceHostSeed = Readonly<{
  /** The interface of the stage the editor opens on. */
  stageType?: StageType;
  /** That stage's committed document, minus its section-owned identity. */
  fields?: SectionDoc;
  /** Resources the protocol's manifest already holds. */
  resources?: readonly CommittedResource[];
  /** Ids the host mints for staged resources and created sections. */
  nextId?: () => string;
}>;

/**
 * The contract, served from memory, over a protocol holding one stage and the
 * resources a test seeded.
 *
 * A committed resource is a manifest entry and, for a content resource, the
 * bytes filed under the `source` that entry names — which is exactly how a
 * protocol carries one, and what makes the host's `preview` able to answer
 * about it.
 */
export function createResourceHost(seed: ResourceHostSeed = {}): InMemoryHost {
  const assets: Record<string, unknown> = {};
  const assetContent: Record<string, Blob> = {};
  for (const resource of seed.resources ?? []) {
    assets[resource.id] = {
      type: resource.kind,
      name: resource.name,
      ...(resource.source === undefined ? {} : { source: resource.source }),
      ...(resource.value === undefined ? {} : { value: resource.value }),
    };
    if (resource.source !== undefined && resource.bytes !== undefined) {
      assetContent[resource.source] = new Blob([resource.bytes]);
    }
  }

  return createInMemoryHost({
    nextId: seed.nextId ?? sequentialIds(),
    assetContent,
    sections: {
      [sectionId({ kind: 'settings' })]: {
        name: 'Resource fields',
        schemaVersion: 8,
      },
      [sectionId({ kind: 'stageOrder' })]: { stages: ['stage-1'] },
      [STAGE_SECTION]: {
        id: 'stage-1',
        type: seed.stageType ?? 'Information',
        ...(seed.fields ?? DEFAULT_INFORMATION_FIELDS),
      },
      [ASSETS_SECTION]: assets,
      [sectionId({ kind: 'codebookNode', typeId: 'person' })]: {
        name: 'Person',
        color: 'node-color-seq-1',
        shape: { default: 'circle' },
        variables: {},
      },
    },
  });
}

/**
 * The same host, with some of its resource procedures answered differently.
 *
 * Every override answers the contract: a host that refuses to stage, one that
 * takes its time, one that reads more out of a file than the in-memory store
 * does. Nothing here is a control being told what to do — the editor calls the
 * same procedures either way and cannot tell which host it is talking to.
 */
export function withResourceProcedures(
  client: ProtocolBuilderClient,
  overrides: Partial<ProtocolBuilderClient['resources']>,
): ProtocolBuilderClient {
  // Proxied rather than spread: a contract client's procedures are reached
  // through property access rather than held as own properties, so a spread
  // copy of one has no procedures on it at all.
  const overridden = new Map<PropertyKey, unknown>(Object.entries(overrides));
  const resources = new Proxy(client.resources, {
    get: (target, property, receiver) =>
      overridden.get(property) ?? Reflect.get(target, property, receiver),
  });
  return new Proxy(client, {
    get: (target, property, receiver) =>
      property === 'resources'
        ? resources
        : Reflect.get(target, property, receiver),
  });
}

/**
 * The same host, counting the section submits it is asked to make.
 *
 * For a test about a form that must NOT save the stage around it. A submit the
 * host never received is the only proof there is: one it received and refused
 * leaves the protocol looking exactly as it did.
 */
export function withSubmitsCounted(
  client: ProtocolBuilderClient,
): Readonly<{ client: ProtocolBuilderClient; submits: () => number }> {
  let submits = 0;
  const counted = new Proxy(client, {
    get: (target, property, receiver) => {
      if (property !== 'submit') return Reflect.get(target, property, receiver);
      return (...args: Parameters<ProtocolBuilderClient['submit']>) => {
        submits += 1;
        return client.submit(...args);
      };
    },
  });
  return { client: counted, submits: () => submits };
}

/**
 * What the host says this edit is holding staged, for a test asserting on
 * residue.
 *
 * The edit is named because staged files belong to it: a list that did not
 * name one is answered with the protocol's committed resources alone, so
 * `status: 'staged'` would come back empty however much the edit was holding —
 * which is what a discard having worked looks like.
 */
export async function stagedResources(
  client: ProtocolBuilderClient,
  protocolId: string,
  editId: string,
): Promise<readonly ResourceDescriptor[]> {
  const listed = await client.resources.list({
    protocolId,
    editId,
    status: 'staged',
  });
  if (listed.status !== 'ok') throw new Error('the host refused to list');
  return listed.data.resources;
}

/** The protocol's own asset manifest, as the host currently holds it. */
export function committedManifest(host: InMemoryHost): SectionDoc {
  return host.store.read(ASSETS_SECTION).document;
}
