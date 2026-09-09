import { z } from 'zod';

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

export const SectionIssueSchema = z.object({
  path: z.array(z.union([z.string(), z.number()])),
  message: z.string(),
});

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

export const SubmitInputSchema = z.object({
  protocolId: ProtocolIdSchema,
  sectionId: SectionIdSchema,
  document: SectionDocumentSchema,
  /**
   * The revision the submitted document was edited from. The holder of the
   * lock is the only writer, so this is never a reason to refuse a submit; the
   * host records it so a revision can say what it was derived from.
   */
  revision: RevisionSchema,
});

/** Sections a host mints. The rest of the taxonomy is a protocol's singletons. */
export const CreatableSectionKindSchema = z.enum([
  'stage',
  'codebookNode',
  'codebookEdge',
]);

export const CreateInputSchema = z.object({
  protocolId: ProtocolIdSchema,
  kind: CreatableSectionKindSchema,
  document: SectionDocumentSchema,
  /** Where a created stage lands in the stage order; appended when absent. */
  position: z.number().int().nonnegative().optional(),
});

export const CreateResultSchema = z.object({
  sectionId: SectionIdSchema,
  revision: RevisionSchema,
});

export const CodebookSubjectSchema = z.discriminatedUnion('entity', [
  z.object({ entity: z.literal('node'), type: z.string().min(1) }),
  z.object({ entity: z.literal('edge'), type: z.string().min(1) }),
  z.object({ entity: z.literal('ego') }),
]);

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

export const RefactorResultSchema = z.object({
  revision: RevisionSchema,
  changedSections: z.array(SectionIdSchema),
});

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
  source: z.string().optional(),
  byteLength: z.number().int().nonnegative().optional(),
  contentType: z.string().optional(),
});

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

export const ResourceListInputSchema = z.object({
  protocolId: ProtocolIdSchema,
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
  /** Stable across an uncertain retry, so a host stages the intent once. */
  requestId: z.string().min(1),
  request: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('content'),
      contentKind: ResourceContentKindSchema,
      name: z.string().min(1),
      /** Filename the manifest will record; no path separators or `..`. */
      source: z.string().min(1),
      contentType: z.string().min(1),
      bytes: z.instanceof(Blob),
    }),
    z.object({
      kind: z.literal('secret'),
      name: z.string().min(1),
      /**
       * Consumed by the host: never returned by any procedure, never placed on
       * a descriptor or an event, never logged.
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

export const ResourcePromoteInputSchema = z.object({
  protocolId: ProtocolIdSchema,
  /** Stable across an uncertain retry, so a host promotes the intent once. */
  promotionId: z.string().min(1),
  resourceIds: z.array(z.string().min(1)),
  secretHandles: z.array(z.string().min(1)).optional(),
});

export const ResourcePromotionSchema = z.object({
  id: z.string().min(1),
  promoted: z.array(ResourceDescriptorSchema),
  /** The revision that carries both the bytes and their manifest entries. */
  revision: RevisionSchema,
});

export const ResourceDiscardInputSchema = z.object({
  protocolId: ProtocolIdSchema,
  /** Absent discards every resource staged in this edit. */
  resourceId: z.string().min(1).optional(),
});

export const ResourceScopedInputSchema = z.object({
  protocolId: ProtocolIdSchema,
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
