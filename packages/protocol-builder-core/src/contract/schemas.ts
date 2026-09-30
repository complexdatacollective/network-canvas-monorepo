import { Schema } from 'effect';

import { isSafeAssetSource } from '@codaco/protocol-validation';
import {
  parseSectionId,
  sectionId,
  type ProtocolSectionId,
} from '@codaco/studio-sync/taxonomy';

const NonEmptyString = Schema.String.check(Schema.isMinLength(1));

const NonNegativeInt = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

export const ProtocolIdSchema = NonEmptyString;

function isProtocolSectionId(value: string): value is ProtocolSectionId {
  try {
    return sectionId(parseSectionId(value)) === value;
  } catch {
    return false;
  }
}

/**
 * A section id, validated by round-tripping it through the section taxonomy so
 * the branded type reaches callers without a cast.
 */
export const SectionIdSchema = Schema.String.pipe(
  Schema.refine(isProtocolSectionId, {
    message: 'not a protocol section id',
  }),
);

export const SectionDocumentSchema = Schema.Record(
  Schema.String,
  Schema.Unknown,
);

/**
 * Where a section document sits in the protocol's history: `sequence` orders
 * (it is the protocol's revision counter, so two sections changed by one
 * atomic operation carry the same one), `contentHash` identifies — the same
 * `contentHash` the sectioned store keys documents by.
 */
export const RevisionSchema = Schema.Struct({
  sequence: Schema.BigInt.check(Schema.isGreaterThanOrEqualToBigInt(0n)),
  contentHash: NonEmptyString,
});

export type Revision = typeof RevisionSchema.Type;

/**
 * A position in a protocol's event stream. Opaque to the package: it is handed
 * back to `WatchProtocol` as `since`, and rides every replayable event as its
 * `cursor` so a client can resume from it after a drop.
 */
export const CursorSchema = NonEmptyString;

/**
 * Who is in a section, as a read-only editor needs to name them.
 *
 * Identity is the connection, not the person: two tabs of one researcher are
 * two presences, and the second opens read-only behind the first.
 */
export const PresenceSchema = Schema.Struct({
  sessionId: NonEmptyString,
  userId: NonEmptyString,
  displayName: NonEmptyString,
  sectionId: Schema.optionalKey(SectionIdSchema),
  mode: Schema.Literals(['editing', 'viewing']),
});

export type Presence = typeof PresenceSchema.Type;

/** Where inside a section document something sits, as the schemas report it. */
const DocumentPathSchema = Schema.Array(
  Schema.Union([Schema.String, Schema.Finite]),
);

export const SectionIssueSchema = Schema.Struct({
  path: DocumentPathSchema,
  message: Schema.String,
});

/** One place a section names something: a reference, at its path. */
export const SectionReferenceSchema = Schema.Struct({
  sectionId: SectionIdSchema,
  path: DocumentPathSchema,
});

export type SectionReference = typeof SectionReferenceSchema.Type;

export const SectionHolderSchema = Schema.Struct({
  sectionId: SectionIdSchema,
  holder: Schema.optionalKey(PresenceSchema),
});

export const ProtocolScopedInputSchema = Schema.Struct({
  protocolId: ProtocolIdSchema,
});

export const SectionListSchema = Schema.Struct({
  sectionIds: Schema.Array(SectionIdSchema),
});

export const AcquireLockInputSchema = Schema.Struct({
  protocolId: ProtocolIdSchema,
  sectionId: SectionIdSchema,
});

export const AcquireLockResultSchema = Schema.Union([
  Schema.Struct({
    lock: Schema.Literal('held'),
    document: SectionDocumentSchema,
    revision: RevisionSchema,
  }),
  Schema.Struct({
    lock: Schema.Literal('readOnly'),
    document: SectionDocumentSchema,
    revision: RevisionSchema,
    holder: PresenceSchema,
  }),
]);

export const SectionAtRevisionSchema = Schema.Struct({
  document: SectionDocumentSchema,
  revision: RevisionSchema,
});

export const WatchProtocolInputSchema = Schema.Struct({
  protocolId: ProtocolIdSchema,
  since: Schema.optionalKey(CursorSchema),
});

/**
 * A section reached a new document, or — when `document` is absent — stopped
 * existing at this revision.
 */
const RevisionEventSchema = Schema.Struct({
  type: Schema.Literal('revision'),
  sectionId: SectionIdSchema,
  revision: RevisionSchema,
  document: Schema.optionalKey(SectionDocumentSchema),
  cursor: Schema.optionalKey(CursorSchema),
});

const LockEventSchema = Schema.Struct({
  type: Schema.Literal('lock'),
  sectionId: SectionIdSchema,
  holder: Schema.optionalKey(PresenceSchema),
  cursor: Schema.optionalKey(CursorSchema),
});

/** Not replayable, so it carries no cursor: a watcher is sent the current one. */
const PresenceEventSchema = Schema.Struct({
  type: Schema.Literal('presence'),
  present: Schema.Array(PresenceSchema),
});

export const ProtocolEventSchema = Schema.Union([
  RevisionEventSchema,
  LockEventSchema,
  PresenceEventSchema,
]);

export type ProtocolEvent = typeof ProtocolEventSchema.Type;

export const ResourceContentKindSchema = Schema.Literals([
  'audio',
  'geojson',
  'image',
  'network',
  'video',
]);

export const ResourceKindSchema = Schema.Literals([
  'audio',
  'geojson',
  'image',
  'network',
  'video',
  'apikey',
]);

export const ResourceStatusSchema = Schema.Literals(['committed', 'staged']);

export const ResourceDescriptorSchema = Schema.Struct({
  id: NonEmptyString,
  kind: ResourceKindSchema,
  name: Schema.String,
  status: ResourceStatusSchema,
  /**
   * The file these bytes are held as: the one the researcher picked while the
   * resource is staged, and the name the asset manifest records once it is
   * committed. A host derives the committed one from the content, so two
   * imports of different bytes under one filename stay two assets.
   */
  source: Schema.optionalKey(Schema.String),
  byteLength: Schema.optionalKey(NonNegativeInt),
  contentType: Schema.optionalKey(Schema.String),
});

export type ResourceDescriptor = typeof ResourceDescriptorSchema.Type;

export const ResourceFailureReasonSchema = Schema.Literals([
  'invalid-content',
  'invalid-request',
  'not-found',
  'promotion-failed',
  'read-only',
  'too-large',
  'unavailable',
  'unsupported-kind',
]);

export const ResourceGatewayFailureSchema = Schema.Struct({
  reason: ResourceFailureReasonSchema,
  message: Schema.String,
  retryable: Schema.Boolean,
  resourceId: Schema.optionalKey(Schema.String),
});

export function resourceResult<TData extends Schema.Top>(data: TData) {
  return Schema.Union([
    Schema.Struct({ status: Schema.Literal('ok'), data }),
    Schema.Struct({
      status: Schema.Literal('failed'),
      failure: ResourceGatewayFailureSchema,
    }),
  ]);
}

/**
 * One edit: a stage editor or a codebook dialog, from the moment it opens to
 * its submit or its cancel.
 *
 * Staging belongs to the edit rather than to the connection, because a session
 * can have two open at once — a codebook dialog over a stage editor, or two
 * tabs — and one edit's cancel must not take away the file the other is about
 * to submit, nor its submit promote a file the other imported. An edit also
 * outlives a dropped socket, which a session identity does not.
 */
const EditIdSchema = NonEmptyString;

/**
 * An idempotency key: stable across an uncertain retry, so a host makes the
 * write once and tells a client whose answer was lost what that attempt wrote.
 *
 * Bounded because a host files the key: Studio's `protocol_write_receipts`
 * holds it in a column checked `BETWEEN 1 AND 512`, so a longer one would
 * reach the database and come back as a server fault rather than as the bad
 * request it is. The bound belongs here, where every host inherits it, rather
 * than in the one host that happens to have a column.
 */
const RequestIdSchema = Schema.String.check(Schema.isLengthBetween(1, 512));

/**
 * The staged resources a submit commits along with the section naming them.
 *
 * The bytes and the manifest entries for them are written in the section's own
 * revision: a refused submit promotes nothing, and a written section never
 * names a resource whose promotion failed. The promotion carries no key of its
 * own: it is part of the write, and the write's `requestId` is what a retry
 * repeats.
 *
 * A promotion names at least one resource. A save with nothing staged omits
 * `promote` — which is what the editors' own resource lifecycle already does —
 * because an empty one is not a promotion that commits nothing: it makes the
 * write touch the asset manifest, so a collaborator holding that section is
 * enough to refuse an ordinary save, and a save that is not refused publishes
 * a manifest revision with nothing in it changed. Refused here rather than
 * ignored by each host, so no host can be the one that forgets.
 */
export const ResourcePromotionRequestSchema = Schema.Struct({
  /** The edit these resources were staged for; only its own can be promoted. */
  editId: EditIdSchema,
  resourceIds: Schema.NonEmptyArray(NonEmptyString),
});

export const SubmitInputSchema = Schema.Struct({
  protocolId: ProtocolIdSchema,
  requestId: RequestIdSchema,
  sectionId: SectionIdSchema,
  document: SectionDocumentSchema,
  /**
   * The revision the submitted document was edited from. The holder of the
   * lock is the only writer, so this is never a reason to refuse a submit; the
   * host records it so a revision can say what it was derived from.
   */
  revision: RevisionSchema,
  promote: Schema.optionalKey(ResourcePromotionRequestSchema),
});

export const SubmitResultSchema = Schema.Struct({
  revision: RevisionSchema,
  /** What `promote` committed; absent when the submit promoted nothing. */
  promoted: Schema.optionalKey(Schema.Array(ResourceDescriptorSchema)),
});

/** Sections a host mints. The rest of the taxonomy is a protocol's singletons. */
export const CreatableSectionKindSchema = Schema.Literals([
  'stage',
  'codebookNode',
  'codebookEdge',
  'codebookEgo',
]);

export const CreateInputSchema = Schema.Struct({
  protocolId: ProtocolIdSchema,
  requestId: RequestIdSchema,
  kind: CreatableSectionKindSchema,
  document: SectionDocumentSchema,
  /** Where a created stage lands in the stage order; appended when absent. */
  position: Schema.optionalKey(NonNegativeInt),
  /**
   * The staged resources the created section names, on the same terms as a
   * submit's: a stage being ADDED can carry an imported file, and there is no
   * revision of it to submit them with afterwards.
   */
  promote: Schema.optionalKey(ResourcePromotionRequestSchema),
});

export const CreateResultSchema = Schema.Struct({
  sectionId: SectionIdSchema,
  revision: RevisionSchema,
  /** What `promote` committed; absent when the create promoted nothing. */
  promoted: Schema.optionalKey(Schema.Array(ResourceDescriptorSchema)),
});

export const CodebookSubjectSchema = Schema.Union([
  Schema.Struct({ entity: Schema.Literal('node'), type: NonEmptyString }),
  Schema.Struct({ entity: Schema.Literal('edge'), type: NonEmptyString }),
  Schema.Struct({ entity: Schema.Literal('ego') }),
]);

export type CodebookSubject = typeof CodebookSubjectSchema.Type;

export const DeleteVariableInputSchema = Schema.Struct({
  protocolId: ProtocolIdSchema,
  subject: CodebookSubjectSchema,
  variableId: NonEmptyString,
});

export const DeleteEntityTypeInputSchema = Schema.Struct({
  protocolId: ProtocolIdSchema,
  entity: Schema.Literals(['node', 'edge']),
  typeId: NonEmptyString,
});

/**
 * A stage section's id. Stages are the only sections `Delete` removes: a
 * codebook type goes with `RefactorDeleteEntityType`, which also sweeps the
 * references to it, and the rest of the taxonomy is a protocol's singletons.
 */
export const StageSectionIdSchema = SectionIdSchema.check(
  Schema.makeFilter((id) => parseSectionId(id).kind === 'stage', {
    message: 'not a stage section id',
  }),
);

export const DeleteSectionInputSchema = Schema.Struct({
  protocolId: ProtocolIdSchema,
  sectionId: StageSectionIdSchema,
});

/** What one atomic change wrote, and which sections it wrote. */
export const SectionChangeResultSchema = Schema.Struct({
  revision: RevisionSchema,
  changedSections: Schema.Array(SectionIdSchema),
});

export const ResourceListInputSchema = Schema.Struct({
  protocolId: ProtocolIdSchema,
  /** Absent lists only what the protocol has committed. */
  editId: Schema.optionalKey(EditIdSchema),
  kinds: Schema.optionalKey(Schema.Array(ResourceKindSchema)),
  status: Schema.optionalKey(ResourceStatusSchema),
});

export const ResourceListSchema = Schema.Struct({
  resources: Schema.Array(ResourceDescriptorSchema),
});

export const StageResourceInputSchema = Schema.Struct({
  protocolId: ProtocolIdSchema,
  /** The edit importing the file, which is what holds it until it is used. */
  editId: EditIdSchema,
  requestId: RequestIdSchema,
  request: Schema.Union([
    Schema.Struct({
      kind: Schema.Literal('content'),
      contentKind: ResourceContentKindSchema,
      name: NonEmptyString,
      /**
       * Filename the manifest will record, refused here on the terms the
       * manifest itself is validated on: a promoted `source` becomes a zip
       * entry name at export, so a name carrying a path separator or `..`
       * either escapes the archive or produces a protocol that cannot be
       * published.
       */
      source: Schema.String.check(
        Schema.makeFilter(isSafeAssetSource, {
          message:
            'Asset source must be a filename without path separators or ".."',
        }),
      ),
      contentType: NonEmptyString,
      /** Base64 on a JSON transport. */
      bytes: Schema.Uint8Array,
    }),
    Schema.Struct({
      kind: Schema.Literal('secret'),
      name: NonEmptyString,
      /**
       * The key itself. A picker holds only the asset id, because that is what
       * a stage field stores — but the value is not hidden from the editor:
       * `inspect` answers with it, and promotion writes it into the asset
       * manifest, which is part of the protocol the researcher sends on.
       */
      value: NonEmptyString,
    }),
  ]),
});

export const StagedResourceSchema = Schema.Struct({
  descriptor: ResourceDescriptorSchema,
});

export const ResourceDiscardInputSchema = Schema.Struct({
  protocolId: ProtocolIdSchema,
  editId: EditIdSchema,
  /** Absent discards every resource staged in this edit, and only in it. */
  resourceId: Schema.optionalKey(NonEmptyString),
});

/**
 * A discard has nothing to answer with, so its success is the status alone:
 * `resourceResult(Schema.Undefined)` would put the whole outcome on a `data`
 * key whose only value is `undefined`, which a transport that drops undefined
 * keys — or a schema that requires the key to be present — turns into a
 * result no branch of the union matches.
 */
export const ResourceDiscardResultSchema = Schema.Union([
  Schema.Struct({ status: Schema.Literal('ok') }),
  Schema.Struct({
    status: Schema.Literal('failed'),
    failure: ResourceGatewayFailureSchema,
  }),
]);

export const ResourceScopedInputSchema = Schema.Struct({
  protocolId: ProtocolIdSchema,
  /** Absent reaches only what the protocol has committed. */
  editId: Schema.optionalKey(EditIdSchema),
  resourceId: NonEmptyString,
});

export const ResourceInspectionSchema = Schema.Struct({
  descriptor: ResourceDescriptorSchema,
  /**
   * An `apikey` resource's own value.
   *
   * `inspect` is where a resource says what it IS, kind by kind — the variable
   * names in a network, a picture's dimensions, a recording's length — and a
   * key's value is that same sort of fact. It is here rather than in `preview`
   * because a preview answers with a URL something renders from, and a key is
   * not one.
   *
   * There is no secrecy to keep: every host writes the value into the asset
   * manifest at promotion, which is the file the researcher sends to other
   * people, and both interview runtimes read it back from there to build a
   * map. An editor that could not read it could only draw the map the
   * participant will not see.
   */
  value: Schema.optionalKey(Schema.String),
  variableNames: Schema.optionalKey(Schema.Array(Schema.String)),
  counts: Schema.optionalKey(
    Schema.Struct({ nodes: Schema.Finite, edges: Schema.Finite }),
  ),
  dimensions: Schema.optionalKey(
    Schema.Struct({ width: Schema.Finite, height: Schema.Finite }),
  ),
  durationSeconds: Schema.optionalKey(Schema.Finite),
});

export const ResourcePreviewSchema = Schema.Struct({
  resourceId: NonEmptyString,
  url: NonEmptyString,
  /** Epoch milliseconds after which `url` may stop resolving. */
  expiresAt: Schema.optionalKey(Schema.Finite),
});
