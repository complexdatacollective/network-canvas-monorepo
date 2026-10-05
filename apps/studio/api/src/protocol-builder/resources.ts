// Protocol resources for the host contract: the asset manifest's entries and
// their bytes.
//
// Studio has an object store and a manifest section but no staged-resource
// storage — nothing today imports a file that is only kept if the edit around
// it is saved. So staging is held in this process, for the life of the edit,
// and only promotion touches storage: the bytes go to the object store and
// their manifest entries land in the `assets` section as one revision. A
// discarded stage leaves nothing behind, which is the property that made
// staging worth having.
import { randomUUID } from 'node:crypto';

import { Clock, Context, Effect, Exit, Layer, Option, Schema } from 'effect';

import {
  ResourceKindSchema,
  type ResourceDescriptorSchema,
  type ResourceGatewayFailureSchema,
  type ResourceInspectionSchema,
  type ResourcePreviewSchema,
  type StageResourceInputSchema,
} from '@codaco/protocol-builder-core/contract/schemas';
import {
  findCollidingAttributeNames,
  findRosterCharacterProblems,
  isUsableExternalAttributeName,
  readRosterCsv,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  VariableValueSchema,
} from '@codaco/shared-consts';
import { MAX_UPLOAD_BYTES } from '@codaco/studio-contract/limits';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import type { ObjectStore } from '../storage/object-store.ts';

type Descriptor = typeof ResourceDescriptorSchema.Type;
type Failure = typeof ResourceGatewayFailureSchema.Type;
export type Inspection = typeof ResourceInspectionSchema.Type;
type Preview = typeof ResourcePreviewSchema.Type;
type StageRequest = (typeof StageResourceInputSchema.Type)['request'];

export type ResourceOutcome<TData> =
  | { status: 'ok'; data: TData }
  | { status: 'failed'; failure: Failure };

/** A discard has nothing to answer with, so its success is the status alone. */
export type DiscardOutcome =
  | { status: 'ok' }
  | { status: 'failed'; failure: Failure };

/** Manifest entries a promotion writes, and the bytes it must store first. */
export type PromotionPlan = {
  entries: Record<string, unknown>;
  promoted: Descriptor[];
};

type StagedEntry = {
  descriptor: Descriptor;
  bytes?: Uint8Array;
  secret?: string;
};

const SHA256_HEX = /^[0-9a-f]{64}$/;

const decodeKind = Schema.decodeUnknownOption(ResourceKindSchema);

function failure(
  reason: Failure['reason'],
  message: string,
  resourceId?: string,
): ResourceOutcome<never> {
  return {
    status: 'failed',
    failure: {
      reason,
      message,
      retryable: reason === 'unavailable' || reason === 'promotion-failed',
      ...(resourceId === undefined ? {} : { resourceId }),
    },
  };
}

/**
 * A roster holding a character no export can carry, refused with where the
 * first one is; `undefined` when it holds none.
 *
 * Answered with a code and a place rather than a sentence, so the editor words
 * it in the researcher's own language; the message is only for a client that
 * does not know the code. The format is decided by the file's extension, as
 * the editor decides it.
 */
async function rosterCharacterFailure(
  bytes: Uint8Array,
  source: string,
): Promise<ResourceOutcome<never> | undefined> {
  const { problems, total } = await findRosterCharacterProblems(
    new TextDecoder().decode(bytes),
    /\.csv$/i.test(source) ? 'csv' : 'json',
  );
  const [problem] = problems;
  if (problem === undefined) return undefined;
  return {
    status: 'failed',
    failure: {
      reason: 'invalid-content',
      message: 'the roster holds a character an export cannot carry',
      retryable: false,
      detail: { code: 'roster-characters', problem, total },
    },
  };
}

/**
 * A roster the interview could not load, refused with what is wrong with it;
 * `undefined` when it would load.
 *
 * The protocol builder's `readRosterFacts` applies these rules in the editor
 * before a roster is staged; they are applied here through the same shared
 * readers and name rules, so a caller other than the editor cannot stage a
 * roster the interview rejects when a participant reaches it. The format is
 * decided as `readRosterFacts` decides it: by the file's extension, and by its
 * media type only when the name says nothing.
 */
async function rosterContentFailure(
  bytes: Uint8Array,
  source: string,
  contentType: string,
): Promise<ResourceOutcome<never> | undefined> {
  const text = new TextDecoder().decode(bytes);
  const problem = isCsvRoster(source, contentType)
    ? await csvRosterProblem(text)
    : jsonRosterProblem(text);
  return problem === undefined
    ? undefined
    : failure('invalid-content', problem);
}

function isCsvRoster(source: string, contentType: string): boolean {
  const name = source.toLowerCase();
  if (name.endsWith('.csv')) return true;
  if (name.endsWith('.json')) return false;
  return contentType.split(';')[0]?.trim().toLowerCase() === 'text/csv';
}

const EMPTY_ROSTER = 'the roster holds no nodes';

/** Read with the interview's own reader, so its columns are the interview's. */
async function csvRosterProblem(text: string): Promise<string | undefined> {
  const csv = await readRosterCsv(text).catch(() => undefined);
  if (csv === undefined) return 'the roster cannot be read as CSV';
  const { columns, rows } = csv;
  const mismatched = rows.find(({ cells }) => cells !== columns.length);
  if (mismatched !== undefined) {
    return `row ${mismatched.row} of the roster has a different number of cells from its header`;
  }
  if (rows.length === 0) return EMPTY_ROSTER;
  return attributeNameProblem(rows.map(({ values }) => values));
}

/**
 * Read as far as the interview's `loadExternalData` reads it, which throws on
 * a node that is not an object, on attributes that are not one, and on a value
 * no variable can hold.
 */
function jsonRosterProblem(text: string): string | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return 'the roster cannot be read as JSON';
  }
  if (!isRecord(parsed)) return 'the roster is not a JSON object';
  const nodes: readonly unknown[] | undefined = Array.isArray(parsed.nodes)
    ? parsed.nodes
    : undefined;
  if (nodes === undefined) return 'the roster has no list of nodes';
  const edges: readonly unknown[] = Array.isArray(parsed.edges)
    ? parsed.edges
    : [];

  const nodeAttributes: Record<string, unknown>[] = [];
  for (const [index, node] of nodes.entries()) {
    const position = index + 1;
    if (!isRecord(node)) {
      return `node ${position} of the roster is not an object`;
    }
    const attributes: unknown = node[entityAttributesProperty];
    if (attributes === undefined) continue;
    if (!isRecord(attributes)) {
      return `the attributes of node ${position} of the roster are not an object`;
    }
    for (const [name, value] of Object.entries(attributes)) {
      if (value === null || value === undefined) continue;
      if (VariableValueSchema.safeParse(value).success) continue;
      return `the ${JSON.stringify(name)} attribute of node ${position} of the roster is not a value a variable can hold`;
    }
    nodeAttributes.push(attributes);
  }

  if (nodes.length === 0 && edges.length === 0) return EMPTY_ROSTER;
  return attributeNameProblem(nodeAttributes);
}

/**
 * A heading the interview cannot pair with any variable, or two it would pair
 * with the same one and keep only one column's values of.
 */
function attributeNameProblem(
  records: readonly Record<string, unknown>[],
): string | undefined {
  const names = [...new Set(records.flatMap((record) => Object.keys(record)))];
  const unusable = names.find((name) => !isUsableExternalAttributeName(name));
  if (unusable !== undefined) {
    return `the roster's attribute name ${JSON.stringify(unusable)} cannot be a variable name`;
  }
  const [collision] = findCollidingAttributeNames(names);
  const [first, second] = collision ?? [];
  if (first !== undefined && second !== undefined) {
    return `the roster's attribute names ${JSON.stringify(first)} and ${JSON.stringify(second)} are the same name written two ways`;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function base64(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString(
    'base64',
  );
}

/**
 * The stored name for promoted bytes: the content hash, keeping the original
 * extension so an exported protocol still names a file a reader recognises.
 * The manifest has nowhere else to put a hash, and `source` may carry no path
 * separators, so this is what lets a committed resource's bytes be found again
 * at `/storage/:hash`.
 */
function storedSource(hash: string, filename: string): string {
  const dot = filename.lastIndexOf('.');
  const extension = dot > 0 ? filename.slice(dot).toLowerCase() : '';
  return /^\.[a-z0-9]{1,16}$/.test(extension) ? `${hash}${extension}` : hash;
}

function hashOfSource(source: string): string | undefined {
  const dot = source.indexOf('.');
  const hash = dot === -1 ? source : source.slice(0, dot);
  return SHA256_HEX.test(hash) ? hash : undefined;
}

function descriptorFromManifestEntry(
  id: string,
  entry: Record<string, unknown>,
): Descriptor | undefined {
  const kind = decodeKind(entry.type);
  if (Option.isNone(kind) || typeof entry.name !== 'string') return undefined;
  return {
    id,
    kind: kind.value,
    name: entry.name,
    status: 'committed',
    ...(typeof entry.source === 'string' ? { source: entry.source } : {}),
  };
}

const planPromotion = Effect.fnUntraced(function* (
  staged: ReadonlyMap<string, StagedEntry>,
  store: ObjectStore['Service'],
  resourceIds: readonly string[],
): Effect.fn.Return<ResourceOutcome<PromotionPlan>> {
  const entries: Record<string, unknown> = {};
  const promoted: Descriptor[] = [];
  for (const resourceId of resourceIds) {
    const entry = staged.get(resourceId);
    if (entry === undefined) {
      return failure('not-found', 'no such staged resource', resourceId);
    }
    if (entry.secret !== undefined) {
      entries[resourceId] = {
        name: entry.descriptor.name,
        type: 'apikey',
        value: entry.secret,
      };
      promoted.push({ ...entry.descriptor, status: 'committed' });
      continue;
    }
    if (!store.configured) {
      return failure(
        'unavailable',
        'this deployment has no object storage configured',
        resourceId,
      );
    }
    if (entry.bytes === undefined || entry.descriptor.source === undefined) {
      return failure(
        'invalid-content',
        'staged resource has no bytes',
        resourceId,
      );
    }
    // An unreachable object store gets the contract's retryable failure rather
    // than the generic error boundary.
    const stored = yield* Effect.exit(
      store.put(
        entry.bytes,
        entry.descriptor.contentType ?? 'application/octet-stream',
      ),
    );
    if (Exit.isFailure(stored)) {
      return failure(
        'unavailable',
        'the object store could not be reached',
        resourceId,
      );
    }
    const source = storedSource(stored.value.hash, entry.descriptor.source);
    entries[resourceId] = {
      name: entry.descriptor.name,
      type: entry.descriptor.kind,
      source,
    };
    promoted.push({ ...entry.descriptor, status: 'committed', source });
  }
  return { status: 'ok', data: { entries, promoted } };
});

/**
 * One edit's staged resources.
 *
 * An edit — a stage editor or a codebook dialog, from the moment it opens to
 * its submit or its cancel — is the unit rather than the connection, because a
 * researcher can have two open in one tab: a codebook dialog over a stage
 * editor, where the dialog's cancel would otherwise take away the file the
 * editor was about to submit. The registry below is what holds one of these
 * per edit; nothing in here can reach another's, because another's is a
 * different object.
 */
export class StagedResources {
  readonly #staged = new Map<string, StagedEntry>();
  readonly #byRequest = new Map<string, string>();
  readonly #mintId: () => string;

  constructor(mintId: () => string) {
    this.#mintId = mintId;
  }

  descriptors(): Descriptor[] {
    return [...this.#staged.values()].map((entry) => entry.descriptor);
  }

  #stagedFor(key: string): StagedEntry | undefined {
    const id = this.#byRequest.get(key);
    return id === undefined ? undefined : this.#staged.get(id);
  }

  /**
   * Idempotent in the request id, so an uncertain retry stages once.
   *
   * The kind is part of the key because the contract asks only that a request
   * id be stable across a retry of one intent, not that it be unique across
   * the pickers an editor has open: a secret answered with an earlier upload's
   * descriptor is a resource the submit cannot promote.
   */
  async stage(
    requestId: string,
    request: StageRequest,
  ): Promise<ResourceOutcome<{ descriptor: Descriptor }>> {
    const key = `${request.kind}\u0000${requestId}`;
    const existing = this.#stagedFor(key);
    if (existing !== undefined) {
      return { status: 'ok', data: { descriptor: existing.descriptor } };
    }
    if (request.kind === 'content' && request.bytes.byteLength === 0) {
      // An empty file promotes into a manifest entry an interview would try to
      // show: an image with no pixels, a roster with no network. The contract's
      // own host refuses it, and a picker that offers it here and nowhere else
      // would be Studio disagreeing with the contract it serves.
      return failure('invalid-content', 'that file is empty');
    }
    if (
      request.kind === 'content' &&
      request.bytes.byteLength > MAX_UPLOAD_BYTES
    ) {
      // Refused before the blob is kept rather than after: the bytes reach the
      // handler with the request, and what this bounds is how long an
      // authenticated caller can make the process hold them — an edit's
      // staging lives until its submit or its cancel.
      return failure(
        'too-large',
        `this deployment stores at most ${MAX_UPLOAD_BYTES} bytes per resource`,
      );
    }
    if (request.kind === 'content' && request.contentKind === 'network') {
      // Read here as well as in the editor, because a caller need not be the
      // editor: a roster holding a character no export can carry would
      // otherwise be found when the data is exported, and one the interview
      // cannot load when a participant reaches it — both long after the
      // researcher could still choose a corrected file.
      const refused =
        (await rosterCharacterFailure(request.bytes, request.source)) ??
        (await rosterContentFailure(
          request.bytes,
          request.source,
          request.contentType,
        ));
      if (refused !== undefined) return refused;
      // A retry of this request can have staged it while the file was read.
      const raced = this.#stagedFor(key);
      if (raced !== undefined) {
        return { status: 'ok', data: { descriptor: raced.descriptor } };
      }
    }
    const id = this.#mintId();
    const entry: StagedEntry =
      request.kind === 'secret'
        ? {
            descriptor: {
              id,
              kind: 'apikey',
              name: request.name,
              status: 'staged',
            },
            secret: request.value,
          }
        : {
            descriptor: {
              id,
              kind: request.contentKind,
              name: request.name,
              status: 'staged',
              source: request.source,
              byteLength: request.bytes.byteLength,
              contentType: request.contentType,
            },
            bytes: request.bytes,
          };
    this.#staged.set(id, entry);
    this.#byRequest.set(key, id);
    return { status: 'ok', data: { descriptor: entry.descriptor } };
  }

  /**
   * Stores the bytes and returns the manifest entries naming them. Writing
   * those entries into the `assets` section is the submit's half, so the bytes
   * and the section naming them land in one revision — and until it does,
   * nothing here is committed and the staged resources are still staged.
   */
  plan(
    store: ObjectStore['Service'],
    resourceIds: readonly string[],
  ): Effect.Effect<ResourceOutcome<PromotionPlan>> {
    return planPromotion(this.#staged, store, resourceIds);
  }

  /**
   * Drops what a written section's promotion took. Called only once that
   * section is written, so a refused submit leaves staging as it was.
   */
  completePromotion(resourceIds: readonly string[]): void {
    for (const resourceId of resourceIds) this.#staged.delete(resourceId);
  }

  discard(resourceId: string | undefined): DiscardOutcome {
    if (resourceId === undefined) {
      this.#staged.clear();
      this.#byRequest.clear();
      return { status: 'ok' };
    }
    if (!this.#staged.delete(resourceId)) {
      return failure('not-found', 'no such staged resource', resourceId);
    }
    return { status: 'ok' };
  }

  /** This edit's staged resource, or the protocol's committed one. */
  inspect(assets: SectionDoc, resourceId: string): ResourceOutcome<Inspection> {
    const staged = this.#staged.get(resourceId);
    if (staged === undefined) return committedInspection(assets, resourceId);
    return {
      status: 'ok',
      data: {
        descriptor: staged.descriptor,
        ...(staged.secret === undefined ? {} : { value: staged.secret }),
      },
    };
  }

  /**
   * Where the bytes are. A staged resource has not been stored yet and is
   * inlined; a committed one is served from the object store by content hash,
   * so its URL is immutable and needs no expiry.
   */
  preview(assets: SectionDoc, resourceId: string): ResourceOutcome<Preview> {
    const staged = this.#staged.get(resourceId);
    if (staged === undefined) return committedPreview(assets, resourceId);
    if (staged.bytes === undefined) {
      return failure(
        'not-found',
        'this host holds no bytes for that resource',
        resourceId,
      );
    }
    const contentType =
      staged.descriptor.contentType ?? 'application/octet-stream';
    return {
      status: 'ok',
      data: {
        resourceId,
        url: `data:${contentType};base64,${base64(staged.bytes)}`,
      },
    };
  }
}

// What the protocol itself holds, which every caller may reach: a resource
// listed, inspected or previewed without naming an edit is a committed one,
// and an edit's staged imports are not the protocol's until a submit promotes
// them.

export function committedDescriptors(assets: SectionDoc): Descriptor[] {
  const descriptors: Descriptor[] = [];
  for (const [id, entry] of Object.entries(assets)) {
    if (!isRecord(entry)) continue;
    const descriptor = descriptorFromManifestEntry(id, entry);
    if (descriptor !== undefined) descriptors.push(descriptor);
  }
  return descriptors;
}

export function committedInspection(
  assets: SectionDoc,
  resourceId: string,
): ResourceOutcome<Inspection> {
  const descriptor = committedDescriptor(assets, resourceId);
  if (descriptor === undefined) {
    return failure('not-found', 'no such resource', resourceId);
  }
  // An API key's value is in the manifest — promotion put it there, and the
  // interview runtime reads it back from the published protocol to build the
  // same map the editor is previewing.
  const entry = assets[resourceId];
  const value =
    descriptor.kind === 'apikey' && isRecord(entry) ? entry.value : undefined;
  return {
    status: 'ok',
    data: {
      descriptor,
      ...(typeof value === 'string' ? { value } : {}),
    },
  };
}

export function committedPreview(
  assets: SectionDoc,
  resourceId: string,
): ResourceOutcome<Preview> {
  const descriptor = committedDescriptor(assets, resourceId);
  if (descriptor === undefined) {
    return failure('not-found', 'no such resource', resourceId);
  }
  const hash =
    descriptor.source === undefined
      ? undefined
      : hashOfSource(descriptor.source);
  if (hash === undefined) {
    return failure(
      'not-found',
      'this host holds no bytes for that resource',
      resourceId,
    );
  }
  return { status: 'ok', data: { resourceId, url: `/storage/${hash}` } };
}

function committedDescriptor(
  assets: SectionDoc,
  resourceId: string,
): Descriptor | undefined {
  const entry = assets[resourceId];
  return isRecord(entry)
    ? descriptorFromManifestEntry(resourceId, entry)
    : undefined;
}

/**
 * One staging area per edit, for as long as that edit is open.
 *
 * The handlers key these by the draft, the owner and the edit, so the two
 * boundaries the contract names are the same boundary here: one editor's
 * staging is unreachable from another's, and one edit's is unreachable from
 * the second edit its own researcher has open.
 */
class StagedResourceRegistry {
  readonly #byEdit = new Map<string, OpenEdit>();
  readonly #mintId: () => string;

  constructor(mintId: () => string) {
    this.#mintId = mintId;
  }

  for(key: string, owner: string, at: number): StagedResources {
    const existing = this.#byEdit.get(key);
    if (existing !== undefined) return existing.resources;
    const resources = new StagedResources(this.#mintId);
    this.#byEdit.set(key, { owner, resources, touchedAt: at });
    return resources;
  }

  /** What one edit staged, if that edit has staged anything. */
  opened(key: string): StagedResources | undefined {
    return this.#byEdit.get(key)?.resources;
  }

  owners(): ReadonlySet<string> {
    return new Set([...this.#byEdit.values()].map((edit) => edit.owner));
  }

  /** An owner that called is here, so every edit it has open is too. */
  touch(prefix: string, at: number): void {
    for (const [key, edit] of this.#byEdit) {
      if (key.startsWith(prefix)) edit.touchedAt = at;
    }
  }

  /**
   * Drops what an owner that has gone quiet was holding.
   *
   * The unary plane has no close to observe — a client whose network refuses
   * WebSockets, or a script — so the only sign of life there is a call, and an
   * owner that has made none since `before` has gone. One with a channel is
   * left alone however long the researcher spends not calling anything, for
   * the reason its leases are: losing an import under an open editor is not a
   * thing that may happen.
   */
  expire(before: number, connected: (owner: string) => boolean): void {
    for (const [key, edit] of this.#byEdit) {
      if (edit.touchedAt > before || connected(edit.owner)) continue;
      this.#byEdit.delete(key);
    }
  }

  /**
   * Drops every edit under a prefix: an owner whose reconnection never came
   * takes all of its open edits with it, however many it had.
   */
  releaseMatching(prefix: string): void {
    for (const key of this.#byEdit.keys()) {
      if (key.startsWith(prefix)) this.#byEdit.delete(key);
    }
  }
}

/** One open edit's staging, and what says its owner is still here. */
type OpenEdit = {
  owner: string;
  resources: StagedResources;
  touchedAt: number;
};

export class StagedImports extends Context.Service<
  StagedImports,
  {
    readonly for: (
      key: string,
      owner: string,
    ) => Effect.Effect<StagedResources>;
    readonly opened: (
      key: string,
    ) => Effect.Effect<StagedResources | undefined>;
    readonly touch: (prefix: string) => Effect.Effect<void>;
    readonly expire: (
      before: number,
      connected: (owner: string) => Effect.Effect<boolean>,
    ) => Effect.Effect<void>;
    readonly releaseMatching: (prefix: string) => Effect.Effect<void>;
  }
>()('@studio/protocol-builder/StagedImports') {
  static readonly layer: Layer.Layer<StagedImports> = Layer.sync(StagedImports)(
    () => {
      const registry = new StagedResourceRegistry(randomUUID);
      return StagedImports.of({
        for: (key, owner) =>
          Effect.map(Clock.currentTimeMillis, (at) =>
            registry.for(key, owner, at),
          ),
        opened: (key) => Effect.sync(() => registry.opened(key)),
        touch: (prefix) =>
          Effect.map(Clock.currentTimeMillis, (at) =>
            registry.touch(prefix, at),
          ),
        expire: Effect.fnUntraced(function* (before, connected) {
          const kept = new Set<string>();
          for (const owner of registry.owners()) {
            if (yield* connected(owner)) kept.add(owner);
          }
          registry.expire(before, (owner) => kept.has(owner));
        }),
        releaseMatching: (prefix) =>
          Effect.sync(() => registry.releaseMatching(prefix)),
      });
    },
  );
}
