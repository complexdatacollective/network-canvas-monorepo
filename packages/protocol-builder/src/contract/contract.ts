import { eventIterator, oc, type RouterContractClient } from '@orpc/contract';
import { z } from 'zod';

import {
  existenceErrors,
  lockErrors,
  lockedSectionErrors,
  promotionErrors,
  protocolErrors,
  refactorErrors,
  referenceErrors,
  shapeErrors,
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
   * A promotion is made once for its `promotionId`: a retry after a lost
   * answer is told what that attempt wrote rather than writing again.
   */
  submit: base
    .errors(lockErrors)
    .errors(lockedSectionErrors)
    .errors(shapeErrors)
    .errors(promotionErrors)
    .input(SubmitInputSchema)
    .output(SubmitResultSchema),

  /**
   * Creates a section and registers its pointer — a stage's place in the stage
   * order — in the same revision. The host mints the id and serialises the
   * call, so it needs no lock of its own, and refuses while an editor holds
   * the pointer section, whose whole-section draft would take the new pointer
   * straight back out. A singleton the protocol already has — `codebookEgo` —
   * is refused rather than overwritten.
   *
   * It takes `promote` on the same terms as `submit`, and for the reason a
   * submit cannot cover: a stage being ADDED can carry a file the researcher
   * imported while composing it, and there is no earlier revision of that
   * stage to have promoted it with. The section, its pointer and the manifest
   * entries are one revision, so a promotion that cannot be committed refuses
   * the create outright and writes nothing.
   */
  create: base
    .errors(shapeErrors)
    .errors(existenceErrors)
    .errors(lockedSectionErrors)
    .errors(promotionErrors)
    .input(CreateInputSchema)
    .output(CreateResultSchema),

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
  delete: base
    .errors(lockedSectionErrors)
    .errors(referenceErrors)
    .input(DeleteSectionInputSchema)
    .output(SectionChangeResultSchema),

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
      .output(SectionChangeResultSchema),
    /** Removes an entity type and its section, on the same terms. */
    deleteEntityType: base
      .errors(refactorErrors)
      .input(DeleteEntityTypeInputSchema)
      .output(SectionChangeResultSchema),
  },

  /**
   * Protocol resources: the asset manifest's entries and their bytes.
   *
   * An imported file is staged for the life of the stage edit, promoted by
   * the stage's `submit`, and discarded with its cancel. There is no promotion
   * of its own: bytes committed without the section naming them, or a section
   * naming bytes that were never committed, are the two half-written states a
   * separate procedure would make reachable. Secret material never comes back
   * out: staging one yields the asset id a field references and an opaque
   * handle the submit's promotion resolves.
   */
  resources: {
    list: base
      .input(ResourceListInputSchema)
      .output(resourceResult(ResourceListSchema)),
    stage: base
      .input(StageResourceInputSchema)
      .output(resourceResult(StagedResourceSchema)),
    discard: base
      .input(ResourceDiscardInputSchema)
      .output(ResourceDiscardResultSchema),
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
