import { z } from 'zod';

import { assetSourceSchema } from '@codaco/protocol-validation';
import { parseSectionId, sectionId } from '@codaco/studio-sync/taxonomy';

export const ProtocolIdSchema = z.string().min(1);

/**
 * A section id, validated by round-tripping it through the section taxonomy so
 * the branded type reaches callers without a cast.
 */
export const SectionIdSchema = z.string().transform((value, ctx) => {
  try {
    return sectionId(parseSectionId(value));
  } catch {
    ctx.addIssue({
      code: 'custom',
      message: `not a protocol section id: ${value}`,
    });
    return z.NEVER;
  }
});

export const SectionDocumentSchema = z.record(z.string(), z.unknown());

/**
 * Where a section document sits in the protocol's history: `sequence` orders
 * (it is the protocol's revision counter, so two sections changed by one
 * atomic operation carry the same one), `contentHash` identifies — the same
 * `contentHash` the sectioned store keys documents by.
 */
export const RevisionSchema = z.object({
  sequence: z.bigint().nonnegative(),
  contentHash: z.string().min(1),
});

export type Revision = z.output<typeof RevisionSchema>;

/**
 * A position in a protocol's event stream. Opaque to the package: it is handed
 * back to `watchProtocol` as `since`, and rides every event as its
 * `withEventMeta` id so oRPC can resend it as `lastEventId` after a drop.
 */
export const CursorSchema = z.string().min(1);

/**
 * Who is in a section, as a read-only editor needs to name them.
 *
 * Identity is the connection, not the person: two tabs of one researcher are
 * two presences, and the second opens read-only behind the first.
 */
export const PresenceSchema = z.object({
  sessionId: z.string().min(1),
  userId: z.string().min(1),
  displayName: z.string().min(1),
  sectionId: SectionIdSchema.optional(),
  mode: z.enum(['editing', 'viewing']),
});

export type Presence = z.output<typeof PresenceSchema>;

/** Where inside a section document something sits, as the schemas report it. */
const DocumentPathSchema = z.array(z.union([z.string(), z.number()]));

export const SectionIssueSchema = z.object({
  path: DocumentPathSchema,
  message: z.string(),
});

/** One place a section names something: a reference, at its path. */
export const SectionReferenceSchema = z.object({
  sectionId: SectionIdSchema,
  path: DocumentPathSchema,
});

export type SectionReference = z.output<typeof SectionReferenceSchema>;

export const SectionHolderSchema = z.object({
  sectionId: SectionIdSchema,
  holder: PresenceSchema.optional(),
});

export const ProtocolScopedInputSchema = z.object({
  protocolId: ProtocolIdSchema,
});

export const SectionListSchema = z.object({
  sectionIds: z.array(SectionIdSchema),
});

export const AcquireLockInputSchema = z.object({
  protocolId: ProtocolIdSchema,
  sectionId: SectionIdSchema,
});

export const AcquireLockResultSchema = z.discriminatedUnion('lock', [
  z.object({
    lock: z.literal('held'),
    document: SectionDocumentSchema,
    revision: RevisionSchema,
  }),
  z.object({
    lock: z.literal('readOnly'),
    document: SectionDocumentSchema,
    revision: RevisionSchema,
    holder: PresenceSchema,
  }),
]);

export const SectionAtRevisionSchema = z.object({
  document: SectionDocumentSchema,
  revision: RevisionSchema,
});

export const WatchProtocolInputSchema = z.object({
  protocolId: ProtocolIdSchema,
  since: CursorSchema.optional(),
});

/**
 * A section reached a new document, or — when `document` is absent — stopped
 * existing at this revision.
 */
const RevisionEventSchema = z.object({
  type: z.literal('revision'),
  sectionId: SectionIdSchema,
  revision: RevisionSchema,
  document: SectionDocumentSchema.optional(),
});

const LockEventSchema = z.object({
  type: z.literal('lock'),
  sectionId: SectionIdSchema,
  holder: PresenceSchema.optional(),
});

const PresenceEventSchema = z.object({
  type: z.literal('presence'),
  present: z.array(PresenceSchema),
});

export const ProtocolEventSchema = z.discriminatedUnion('type', [
  RevisionEventSchema,
  LockEventSchema,
  PresenceEventSchema,
]);

export type ProtocolEvent = z.output<typeof ProtocolEventSchema>;

export const ResourceContentKindSchema = z.enum([
  'audio',
  'geojson',
  'image',
  'network',
  'video',
]);

export const ResourceKindSchema = z.enum([
  'audio',
  'geojson',
  'image',
  'network',
  'video',
  'apikey',
]);

export const ResourceStatusSchema = z.enum(['committed', 'staged']);

export const ResourceSecretStorageSchema = z.enum(['plaintext', 'vault']);

export const ResourceDescriptorSchema = z.object({
  id: z.string().min(1),
  kind: ResourceKindSchema,
  name: z.string(),
  status: ResourceStatusSchema,
  /**
   * The file these bytes are held as: the one the researcher picked while the
   * resource is staged, and the name the asset manifest records once it is
   * committed. A host derives the committed one from the content, so two
   * imports of different bytes under one filename stay two assets.
   */
  source: z.string().optional(),
  byteLength: z.number().int().nonnegative().optional(),
  contentType: z.string().optional(),
});

export type ResourceDescriptor = z.output<typeof ResourceDescriptorSchema>;

export const ResourceFailureReasonSchema = z.enum([
  'invalid-content',
  'invalid-request',
  'not-found',
  'promotion-failed',
  'read-only',
  'too-large',
  'unavailable',
  'unsupported-kind',
]);

export const ResourceGatewayFailureSchema = z.object({
  reason: ResourceFailureReasonSchema,
  message: z.string(),
  retryable: z.boolean(),
  resourceId: z.string().optional(),
});

export function resourceResult<TData extends z.ZodType>(data: TData) {
  return z.discriminatedUnion('status', [
    z.object({ status: z.literal('ok'), data }),
    z.object({
      status: z.literal('failed'),
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
const EditIdSchema = z.string().min(1);

/**
 * An idempotency key: stable across an uncertain retry, so a host makes the
 * write once and tells a client whose answer was lost what that attempt wrote.
 */
const RequestIdSchema = z.string().min(1);

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
export const ResourcePromotionRequestSchema = z.object({
  /** The edit these resources were staged for; only its own can be promoted. */
  editId: EditIdSchema,
  resourceIds: z.array(z.string().min(1)).min(1),
  secretHandles: z.array(z.string().min(1)).optional(),
});

export const SubmitInputSchema = z.object({
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
  promote: ResourcePromotionRequestSchema.optional(),
});

export const SubmitResultSchema = z.object({
  revision: RevisionSchema,
  /** What `promote` committed; absent when the submit promoted nothing. */
  promoted: z.array(ResourceDescriptorSchema).optional(),
});

/** Sections a host mints. The rest of the taxonomy is a protocol's singletons. */
export const CreatableSectionKindSchema = z.enum([
  'stage',
  'codebookNode',
  'codebookEdge',
  'codebookEgo',
]);

export const CreateInputSchema = z.object({
  protocolId: ProtocolIdSchema,
  requestId: RequestIdSchema,
  kind: CreatableSectionKindSchema,
  document: SectionDocumentSchema,
  /** Where a created stage lands in the stage order; appended when absent. */
  position: z.number().int().nonnegative().optional(),
  /**
   * The staged resources the created section names, on the same terms as a
   * submit's: a stage being ADDED can carry an imported file, and there is no
   * revision of it to submit them with afterwards.
   */
  promote: ResourcePromotionRequestSchema.optional(),
});

export const CreateResultSchema = z.object({
  sectionId: SectionIdSchema,
  revision: RevisionSchema,
  /** What `promote` committed; absent when the create promoted nothing. */
  promoted: z.array(ResourceDescriptorSchema).optional(),
});

export const CodebookSubjectSchema = z.discriminatedUnion('entity', [
  z.object({ entity: z.literal('node'), type: z.string().min(1) }),
  z.object({ entity: z.literal('edge'), type: z.string().min(1) }),
  z.object({ entity: z.literal('ego') }),
]);

export type CodebookSubject = z.output<typeof CodebookSubjectSchema>;

export const DeleteVariableInputSchema = z.object({
  protocolId: ProtocolIdSchema,
  subject: CodebookSubjectSchema,
  variableId: z.string().min(1),
});

export const DeleteEntityTypeInputSchema = z.object({
  protocolId: ProtocolIdSchema,
  entity: z.enum(['node', 'edge']),
  typeId: z.string().min(1),
});

/**
 * A stage section's id. Stages are the only sections `delete` removes: a
 * codebook type goes with `refactor.deleteEntityType`, which also sweeps the
 * references to it, and the rest of the taxonomy is a protocol's singletons.
 */
export const StageSectionIdSchema = SectionIdSchema.refine(
  (id) => parseSectionId(id).kind === 'stage',
  'not a stage section id',
);

export const DeleteSectionInputSchema = z.object({
  protocolId: ProtocolIdSchema,
  sectionId: StageSectionIdSchema,
});

/** What one atomic change wrote, and which sections it wrote. */
export const SectionChangeResultSchema = z.object({
  revision: RevisionSchema,
  changedSections: z.array(SectionIdSchema),
});

export const ResourceListInputSchema = z.object({
  protocolId: ProtocolIdSchema,
  /** Absent lists only what the protocol has committed. */
  editId: EditIdSchema.optional(),
  kinds: z.array(ResourceKindSchema).optional(),
  status: ResourceStatusSchema.optional(),
});

export const ResourceListSchema = z.object({
  /**
   * Where this host puts a promoted secret's value. A researcher pasting an
   * API key is deciding whether to put a credential into a file they will send
   * to other people, and only the host knows which it is.
   */
  secretStorage: ResourceSecretStorageSchema,
  resources: z.array(ResourceDescriptorSchema),
});

export const StageResourceInputSchema = z.object({
  protocolId: ProtocolIdSchema,
  /** The edit importing the file, which is what holds it until it is used. */
  editId: EditIdSchema,
  requestId: RequestIdSchema,
  request: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('content'),
      contentKind: ResourceContentKindSchema,
      name: z.string().min(1),
      /**
       * Filename the manifest will record, refused here on the terms the
       * manifest itself is validated on: a promoted `source` becomes a zip
       * entry name at export, so a name carrying a path separator or `..`
       * either escapes the archive or produces a protocol that cannot be
       * published.
       */
      source: assetSourceSchema,
      contentType: z.string().min(1),
      bytes: z.instanceof(Blob),
    }),
    z.object({
      kind: z.literal('secret'),
      name: z.string().min(1),
      /**
       * Consumed by the host: no resource procedure ever answers with it and
       * no descriptor carries it, so a picker only ever holds the asset id.
       * Where it goes at promotion is what `secretStorage` names — a
       * `plaintext` host writes it into the asset manifest, which is part of
       * the protocol the researcher then sends to other people.
       */
      value: z.string().min(1),
    }),
  ]),
});

export const StagedResourceSchema = z.object({
  descriptor: ResourceDescriptorSchema,
  /** Present for a staged secret; names it without carrying its value. */
  handle: z.string().min(1).optional(),
});

export const ResourceDiscardInputSchema = z.object({
  protocolId: ProtocolIdSchema,
  editId: EditIdSchema,
  /** Absent discards every resource staged in this edit, and only in it. */
  resourceId: z.string().min(1).optional(),
});

/**
 * A discard has nothing to answer with, so its success is the status alone:
 * `resourceResult(z.undefined())` would put the whole outcome on a `data` key
 * whose only value is `undefined`, which a transport that drops undefined
 * keys — or a schema that requires the key to be present — turns into a
 * result no branch of the union matches.
 */
export const ResourceDiscardResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok') }),
  z.object({
    status: z.literal('failed'),
    failure: ResourceGatewayFailureSchema,
  }),
]);

export const ResourceScopedInputSchema = z.object({
  protocolId: ProtocolIdSchema,
  /** Absent reaches only what the protocol has committed. */
  editId: EditIdSchema.optional(),
  resourceId: z.string().min(1),
});

export const ResourceInspectionSchema = z.object({
  descriptor: ResourceDescriptorSchema,
  variableNames: z.array(z.string()).optional(),
  counts: z.object({ nodes: z.number(), edges: z.number() }).optional(),
  dimensions: z.object({ width: z.number(), height: z.number() }).optional(),
  durationSeconds: z.number().optional(),
});

export const ResourcePreviewSchema = z.object({
  resourceId: z.string().min(1),
  url: z.string().min(1),
  /** Epoch milliseconds after which `url` may stop resolving. */
  expiresAt: z.number().optional(),
});
