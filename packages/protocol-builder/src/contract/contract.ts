import { eventIterator, oc, type RouterContractClient } from '@orpc/contract';
import { z } from 'zod';

import {
  lockErrors,
  protocolErrors,
  refactorErrors,
  shapeErrors,
} from './errors.ts';
import {
  AcquireLockInputSchema,
  AcquireLockResultSchema,
  CreateInputSchema,
  CreateResultSchema,
  DeleteEntityTypeInputSchema,
  DeleteVariableInputSchema,
  ProtocolEventSchema,
  ProtocolScopedInputSchema,
  RefactorResultSchema,
  ResourceDiscardInputSchema,
  ResourceInspectionSchema,
  ResourceListInputSchema,
  ResourceListSchema,
  ResourcePreviewSchema,
  ResourcePromoteInputSchema,
  ResourcePromotionSchema,
  ResourceScopedInputSchema,
  RevisionSchema,
  SectionAtRevisionSchema,
  SectionListSchema,
  StageResourceInputSchema,
  StagedResourceSchema,
  SubmitInputSchema,
  WatchProtocolInputSchema,
  resourceResult,
} from './schemas.ts';

const base = oc.errors(protocolErrors);

/**
 * The host contract `@codaco/protocol-builder` is written against.
 *
 * One editor owns a section while it holds that section's lock, so nothing
 * here describes an edit as a command sequence, carries an epoch, or offers a
 * way back after a lock is lost: a host refuses the submit and the draft goes.
 * Studio serves this over its transport, Architect serves it in-process, and
 * the in-memory host serves it for tests.
 */
export const contract = {
  /**
   * Takes the section for editing and returns it. `readOnly` names the holder
   * so the editor can say who has it; there is no renewal, takeover, or
   * re-acquire.
   */
  acquireLock: base
    .input(AcquireLockInputSchema)
    .output(AcquireLockResultSchema),

  releaseLock: base.input(AcquireLockInputSchema).output(z.void()),

  getSection: base
    .input(AcquireLockInputSchema)
    .output(SectionAtRevisionSchema),

  /**
   * Which sections the protocol has. A component that reads a family of them —
   * every node type, say — needs their ids before it can observe any of them,
   * and the taxonomy has no index section to read them from. `watchProtocol`
   * keeps the answer current: a revision for an unknown section adds it, and a
   * removal drops it.
   */
  listSections: base.input(ProtocolScopedInputSchema).output(SectionListSchema),

  /**
   * Every section revision, lock change, and presence change for one open
   * protocol, in the protocol's own revision order, from `since` onwards.
   *
   * One channel per open protocol rather than one per section: a per-section
   * subscription leaves a gap between reading a section and its stream going
   * live, which every subscriber would then have to close by revision number.
   */
  watchProtocol: base
    .input(WatchProtocolInputSchema)
    .output(eventIterator(ProtocolEventSchema)),

  /**
   * Writes the whole section as one revision.
   *
   * Exactly two refusals: the caller does not hold the lock, and the document
   * is not shaped like this section. A draft that is invalid across sections —
   * a stage naming a variable a collaborator has just deleted — is written,
   * because drafts tolerate transient invalidity and validity is enforced at
   * publication.
   */
  submit: base
    .errors(lockErrors)
    .errors(shapeErrors)
    .input(SubmitInputSchema)
    .output(z.object({ revision: RevisionSchema })),

  /**
   * Creates a section and registers its pointer — a stage's place in the stage
   * order — in the same revision. The host mints the id and serialises the
   * call, so it needs no lock.
   */
  create: base
    .errors(shapeErrors)
    .input(CreateInputSchema)
    .output(CreateResultSchema),

  /**
   * Changes that cannot be contained in one section, so they cannot be made
   * under one lock. Each takes every section it writes or fails naming who
   * holds what. Codebook dialogs issue these; no stage editor does.
   */
  refactor: {
    /**
     * Removes a codebook variable and the references to it the schema
     * declares, or refuses naming the ones it cannot remove: a reference
     * inside a list — a prompt, a form field, a filter rule — goes with the
     * entry holding it, and one that is a property of a stage cannot be
     * removed without inventing what the stage then means.
     */
    deleteVariable: base
      .errors(refactorErrors)
      .input(DeleteVariableInputSchema)
      .output(RefactorResultSchema),
    /** Removes an entity type and its section, on the same terms. */
    deleteEntityType: base
      .errors(refactorErrors)
      .input(DeleteEntityTypeInputSchema)
      .output(RefactorResultSchema),
  },

  /**
   * Protocol resources: the asset manifest's entries and their bytes.
   *
   * An imported file is staged for the life of the stage edit, promoted with
   * the stage's submit, and discarded with its cancel. Secret material never
   * comes back out: staging one yields the asset id a field references and an
   * opaque handle promotion resolves.
   */
  resources: {
    list: base
      .input(ResourceListInputSchema)
      .output(resourceResult(ResourceListSchema)),
    stage: base
      .input(StageResourceInputSchema)
      .output(resourceResult(StagedResourceSchema)),
    promote: base
      .input(ResourcePromoteInputSchema)
      .output(resourceResult(ResourcePromotionSchema)),
    discard: base
      .input(ResourceDiscardInputSchema)
      .output(resourceResult(z.undefined())),
    inspect: base
      .input(ResourceScopedInputSchema)
      .output(resourceResult(ResourceInspectionSchema)),
    preview: base
      .input(ResourceScopedInputSchema)
      .output(resourceResult(ResourcePreviewSchema)),
  },
};

export type ProtocolBuilderContract = typeof contract;

/** What a host hands `<ProtocolBuilder>`, wire-backed or in-process. */
export type ProtocolBuilderClient =
  RouterContractClient<ProtocolBuilderContract>;
