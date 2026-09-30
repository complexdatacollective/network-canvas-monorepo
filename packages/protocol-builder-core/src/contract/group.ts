import { Schema } from 'effect';
import * as Rpc from 'effect/unstable/rpc/Rpc';
import type * as RpcClient from 'effect/unstable/rpc/RpcClient';
import type { RpcClientError } from 'effect/unstable/rpc/RpcClientError';
import * as RpcGroup from 'effect/unstable/rpc/RpcGroup';

import {
  InvalidShape,
  ProtocolError,
  ProtocolNotFound,
  PromotionFailed,
  RefactorError,
  ReferencesRemain,
  SectionExists,
  SectionNotFound,
  SectionsLocked,
  WriteError,
} from './errors.ts';
import {
  AcquireLockInputSchema,
  AcquireLockResultSchema,
  CreateInputSchema,
  CreateResultSchema,
  DeleteEntityTypeInputSchema,
  DeleteSectionInputSchema,
  DeleteVariableInputSchema,
  ProtocolEventSchema,
  ProtocolScopedInputSchema,
  ResourceDiscardInputSchema,
  ResourceDiscardResultSchema,
  ResourceInspectionSchema,
  ResourceListInputSchema,
  ResourceListSchema,
  ResourcePreviewSchema,
  ResourceScopedInputSchema,
  SectionAtRevisionSchema,
  SectionChangeResultSchema,
  SectionListSchema,
  StageResourceInputSchema,
  StagedResourceSchema,
  SubmitInputSchema,
  SubmitResultSchema,
  WatchProtocolInputSchema,
  resourceResult,
} from './schemas.ts';
import { HostSession } from './session.ts';

/**
 * The host contract `@codaco/protocol-builder` is written against.
 *
 * One editor owns a section while it holds that section's lock, so nothing
 * here describes an edit as a command sequence, carries an epoch, or offers a
 * way back after a lock is lost: a host refuses the submit and the draft goes.
 * Studio serves this over its transport, Architect serves it in-process, and
 * the in-memory host serves it for tests.
 */
export class ProtocolBuilderGroup extends RpcGroup.make(
  /**
   * Takes the section for editing and returns it. `readOnly` names the holder
   * so the editor can say who has it; there is no renewal, takeover, or
   * re-acquire.
   */
  Rpc.make('AcquireLock', {
    payload: AcquireLockInputSchema,
    success: AcquireLockResultSchema,
    error: ProtocolError,
  }),

  Rpc.make('ReleaseLock', {
    payload: AcquireLockInputSchema,
    error: ProtocolError,
  }),

  Rpc.make('GetSection', {
    payload: AcquireLockInputSchema,
    success: SectionAtRevisionSchema,
    error: ProtocolError,
  }),

  /**
   * Which sections the protocol has. A component that reads a family of them —
   * every node type, say — needs their ids before it can observe any of them,
   * and the taxonomy has no index section to read them from. `WatchProtocol`
   * keeps the answer current: a revision for an unknown section adds it, and a
   * removal drops it.
   */
  Rpc.make('ListSections', {
    payload: ProtocolScopedInputSchema,
    success: SectionListSchema,
    error: ProtocolError,
  }),

  /**
   * Every section revision, lock change, and presence change for one open
   * protocol, in the protocol's own revision order, from `since` onwards.
   *
   * One channel per open protocol rather than one per section: a per-section
   * subscription leaves a gap between reading a section and its stream going
   * live, which every subscriber would then have to close by revision number.
   */
  Rpc.make('WatchProtocol', {
    payload: WatchProtocolInputSchema,
    success: ProtocolEventSchema,
    error: ProtocolError,
    stream: true,
  }),

  /**
   * Writes the whole section as one revision, with the staged resources it
   * names promoted into the same one.
   *
   * Four refusals: the caller does not hold the lock, the document is not
   * shaped like this section, the resources it asked to promote cannot be
   * committed, and — for a submit that promotes — an editor holds the asset
   * manifest the promotion writes. None of them writes anything: a section and
   * the bytes it points at are committed together or not at all. A draft that
   * is invalid across sections — a stage naming a variable a collaborator has
   * just deleted — is written, because drafts tolerate transient invalidity
   * and validity is enforced at publication.
   *
   * The write is made once for its `requestId`: a retry after a lost answer is
   * told what that attempt wrote — the revision and what it promoted — rather
   * than writing again.
   */
  Rpc.make('Submit', {
    payload: SubmitInputSchema,
    success: SubmitResultSchema,
    error: WriteError,
  }),

  /**
   * Creates a section and registers its pointer — a stage's place in the stage
   * order — in the same revision. The host mints the id and serialises the
   * call, so it needs no lock of its own, and refuses while an editor holds
   * the pointer section, whose whole-section draft would take the new pointer
   * straight back out. A singleton the protocol already has — `codebookEgo` —
   * is refused rather than overwritten.
   *
   * It takes `promote` on the same terms as `Submit`, and for the reason a
   * submit cannot cover: a stage being ADDED can carry a file the researcher
   * imported while composing it, and there is no earlier revision of that
   * stage to have promoted it with. The section, its pointer and the manifest
   * entries are one revision, so a promotion that cannot be committed refuses
   * the create outright and writes nothing.
   *
   * A create is made once for its `requestId`, whether or not it promotes
   * anything: it mints an id, so a retry that was not recognised would leave
   * the protocol holding the stage twice and tell the client about only one.
   */
  Rpc.make('Create', {
    payload: CreateInputSchema,
    success: CreateResultSchema,
    error: Schema.Union([
      ProtocolNotFound,
      SectionNotFound,
      InvalidShape,
      SectionExists,
      SectionsLocked,
      PromotionFailed,
    ]),
  }),

  /**
   * Removes a stage and its place in the stage order in one revision.
   *
   * Server-mediated like the refactors below and for the same reason: the two
   * writes cannot be made under one lock, and a stage left out of the order —
   * or an order naming a stage that is gone — is a protocol that cannot be
   * assembled. It takes no lock of its own and refuses while any editor holds
   * either section, including one in this session whose draft would put the
   * stage back.
   *
   * A stage other stages depend on is refused naming them, not swept: a skip
   * destination or the pedigree a narrative describes is a decision made about
   * that other stage, and the refactors strip references only where a codebook
   * dialog is the researcher deciding the thing is gone. The order pointer is
   * not such a dependency — it is how the protocol holds the stage, and this
   * call rewrites it.
   */
  Rpc.make('Delete', {
    payload: DeleteSectionInputSchema,
    success: SectionChangeResultSchema,
    error: Schema.Union([
      ProtocolNotFound,
      SectionNotFound,
      SectionsLocked,
      ReferencesRemain,
    ]),
  }),

  /**
   * The two `Refactor…` procedures are changes that cannot be contained in one
   * section, so they cannot be made under one lock. Each takes every section it
   * writes or fails naming who holds what. Codebook dialogs issue these; no
   * stage editor does.
   *
   * This one removes a codebook variable and the references to it the schema
   * declares, or refuses naming the ones it cannot remove: a reference inside a
   * list — a prompt, a form field, a filter rule — goes with the entry holding
   * it, and one that is a property of a stage cannot be removed without
   * inventing what the stage then means.
   */
  Rpc.make('RefactorDeleteVariable', {
    payload: DeleteVariableInputSchema,
    success: SectionChangeResultSchema,
    error: RefactorError,
  }),

  /** Removes an entity type and its section, on the same terms. */
  Rpc.make('RefactorDeleteEntityType', {
    payload: DeleteEntityTypeInputSchema,
    success: SectionChangeResultSchema,
    error: RefactorError,
  }),

  /**
   * The `Resources…` procedures: the asset manifest's entries and their bytes.
   *
   * An imported file is staged for the life of the stage edit, promoted by
   * the stage's `Submit`, and discarded with its cancel. There is no promotion
   * of its own: bytes committed without the section naming them, or a section
   * naming bytes that were never committed, are the two half-written states a
   * separate procedure would make reachable. Secret material never comes back
   * out: staging one yields the asset id a field references and an opaque
   * handle the submit's promotion resolves.
   *
   * Every one of them names the edit it is made for, and reaches no other
   * edit's staging — a session with a codebook dialog open over a stage editor
   * is two edits, and either cancel would otherwise discard what the other was
   * about to submit.
   */
  Rpc.make('ResourcesList', {
    payload: ResourceListInputSchema,
    success: resourceResult(ResourceListSchema),
    error: ProtocolError,
  }),

  Rpc.make('ResourcesStage', {
    payload: StageResourceInputSchema,
    success: resourceResult(StagedResourceSchema),
    error: ProtocolError,
  }),

  Rpc.make('ResourcesDiscard', {
    payload: ResourceDiscardInputSchema,
    success: ResourceDiscardResultSchema,
    error: ProtocolError,
  }),

  Rpc.make('ResourcesInspect', {
    payload: ResourceScopedInputSchema,
    success: resourceResult(ResourceInspectionSchema),
    error: ProtocolError,
  }),

  Rpc.make('ResourcesPreview', {
    payload: ResourceScopedInputSchema,
    success: resourceResult(ResourcePreviewSchema),
    error: ProtocolError,
  }),
).middleware(HostSession) {}

export type ProtocolBuilderRpcs = RpcGroup.Rpcs<typeof ProtocolBuilderGroup>;

export type ProtocolBuilderTag = ProtocolBuilderRpcs['_tag'];

/** What a host hands `<ProtocolBuilder>`, wire-backed or in-process. */
export type ProtocolBuilderClient = RpcClient.RpcClient.Flat<
  ProtocolBuilderRpcs,
  RpcClientError
>;
