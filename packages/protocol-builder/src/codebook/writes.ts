import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { Redacted } from 'effect';
import { useCallback } from 'react';
import { v4 as uuid } from 'uuid';

import type { ProtocolBuilderTag } from '@codaco/protocol-builder-core/contract';
import type { Presence } from '@codaco/protocol-builder-core/contract/schemas';
import { contentHash, type SectionDoc } from '@codaco/studio-sync/apply';
import {
  sectionId,
  type ProtocolSectionId,
} from '@codaco/studio-sync/taxonomy';

import { READ_ONLY_MESSAGE } from '../form/readOnlyRefusal.ts';
import { attempt, type Refusal } from '../state/attempt.ts';
import { readCreatedSection } from '../state/channel.ts';
import type { CodebookRefusal } from '../state/codebookRefusal.ts';
import {
  useProtocolBuilderContext,
  type ProtocolBuilderAdapter,
} from '../state/context.ts';
import type { ResourcePromotion } from '../state/hooks.ts';
import { useKeptRequestId, type KeptRequestId } from '../state/requestKey.ts';
import {
  useStagedCodebookStore,
  type StagedCodebookStore,
} from '../state/stagedCodebook.ts';
import { codebookRefusalMessage } from './compoundFailureCopy.ts';
import {
  draftRefusalMessage,
  DuplicateVariableNameError,
  InvalidCodebookDraftError,
  MissingVariableError,
  sectionIdForCodebookSubject,
  type CodebookSubject,
} from './editing.ts';

/**
 * One key for one codebook change the researcher asked for.
 *
 * A host makes the write once for its key and answers a retry with what that
 * attempt wrote. Minted per change rather than per dialog: a refused change
 * the researcher corrects and asks for again is a different intent, and one
 * that reused the key would be answered with the earlier write instead of
 * being made.
 *
 * Only the rewrite of an existing section mints its key this way. A rewrite
 * has nothing stable to key a retry on — the second attempt lays the draft
 * over the document the host holds NOW, which is a different document from
 * the one the first attempt wrote — so there is no ask for `useKeptRequestId`
 * to recognise. The two CREATES do have one, and use it: a create that was not
 * recognised as a retry leaves the codebook holding two entity types where the
 * researcher added one.
 */
const nextRequestId = (): string => uuid();

/** What a create needs to read the section it made into the cache. */
type CreateDeps = Readonly<{
  adapter: ProtocolBuilderAdapter;
  queryClient: QueryClient;
  protocolId: string;
}>;

/** Lays the change over the section document the host holds now. */
type SectionUpdate = (authoritativeDocument: SectionDoc) => SectionDoc;

/**
 * What became of a codebook change the researcher asked for.
 *
 * Every refusal is answered rather than thrown. A codebook write is made from
 * a click handler — a row's Create button, a dialog's Save — which has nowhere
 * to put a rejection, and a caller that marked itself busy across the await
 * would stay busy for good.
 */
export type CodebookWriteOutcome =
  | Readonly<{ status: 'applied'; sectionId: ProtocolSectionId }>
  | Readonly<{
      status: 'refused';
      message: string;
      /**
       * What the refusal was, beside the sentence for it.
       *
       * A surface reads it for two things it cannot get from the sentence: a
       * held section is the one refusal that is not a fault — the change is
       * fine and will work once the collaborator is finished, so it is shown
       * in the register of a notice rather than of an error — and a stage row
       * has its own words for a codebook subject that has gone.
       */
      refusal: CodebookRefusal;
    }>;

const refused = (refusal: CodebookRefusal): CodebookWriteOutcome => ({
  status: 'refused',
  message: codebookRefusalMessage(refusal),
  refusal,
});

const promotionRefusal = (resourceId: string | undefined): CodebookRefusal =>
  resourceId === undefined
    ? { kind: 'promotionFailed' }
    : { kind: 'promotionFailed', resourceId };

const heldRefusal = (holder: Presence | undefined): CodebookRefusal =>
  holder === undefined
    ? { kind: 'held' }
    : { kind: 'held', holders: [Redacted.value(holder.displayName)] };

/**
 * Everyone a `SectionsLocked` refusal names, once each and in the order the
 * host named them.
 *
 * A write that touches several sections can be held up by more than one
 * collaborator, and being told about one of them and then about the next is
 * how a researcher comes to believe the application is refusing at random. A
 * host that would not name a holder contributes nothing to the list.
 */
export const blockedHolders = (
  blocked: readonly Readonly<{ holder?: Presence }>[],
): readonly string[] => [
  ...new Set(
    blocked.flatMap((section) =>
      section.holder === undefined
        ? []
        : [Redacted.value(section.holder.displayName)],
    ),
  ),
];

/** The refusal a write blocked by other editors answers with. */
const blockedRefusal = (
  blocked: readonly Readonly<{ holder?: Presence }>[],
): CodebookRefusal => {
  const holders = blockedHolders(blocked);
  return holders.length === 0 ? { kind: 'held' } : { kind: 'held', holders };
};

/** Every procedure a codebook write calls. */
type CodebookWriteTag = Extract<
  ProtocolBuilderTag,
  'AcquireLock' | 'Submit' | 'Create' | 'RefactorDeleteVariable'
>;

/**
 * Every way a host refuses a codebook write, in the researcher's terms.
 *
 * One switch for every procedure a write calls, so a refusal the contract
 * gains does not type-check until it is placed here rather than falling
 * through to "could not be sent" — which is how a change somebody else was
 * holding up, and one the protocol still had references to, were once both
 * reported. A procedure is only ever answered with the refusals its
 * own contract declares (see `attempt`), so placing a refusal here for one
 * procedure changes nothing for the others. `undefined` is a failure no
 * contract declares: the call never reached a host that would answer it.
 */
const writeRefusal = (
  refusal: Refusal<CodebookWriteTag> | undefined,
): CodebookRefusal => {
  if (refusal === undefined) return { kind: 'unreachable' };
  switch (refusal._tag) {
    case 'ProtocolNotFound':
      return { kind: 'protocolGone' };
    case 'SectionNotFound':
      return { kind: 'sectionGone' };
    case 'NotLockHolder':
      return heldRefusal(refusal.holder);
    case 'SectionsLocked':
      return blockedRefusal(refusal.blocked);
    case 'ReferencesRemain':
      return { kind: 'referencesRemain', references: refusal.remaining.length };
    case 'InvalidShape':
      return { kind: 'invalidShape' };
    case 'PromotionFailed':
      return promotionRefusal(refusal.failure.resourceId);
    case 'SectionExists':
      return { kind: 'sectionCreatedElsewhere' };
  }
  // Every refusal is placed above: a new one does not type-check here.
  return refusal satisfies never;
};

/**
 * What a draft the builder refused says to the researcher.
 *
 * `editing.ts` encodes the two refusals a researcher can act on — a duplicate
 * attribute name, an attribute a collaborator deleted — precisely so they can
 * be passed on and decoded where they are rendered. Everything else it throws
 * reports a wiring defect and is written for whoever reads a log.
 */
const builderRefusal = (error: unknown): CodebookWriteOutcome => {
  if (
    error instanceof DuplicateVariableNameError ||
    error instanceof MissingVariableError
  ) {
    return {
      status: 'refused',
      message: error.message,
      refusal: { kind: 'unexplained' },
    };
  }
  if (error instanceof InvalidCodebookDraftError) {
    return {
      status: 'refused',
      message: draftRefusalMessage(error),
      refusal: { kind: 'invalidShape' },
    };
  }
  return refused({ kind: 'unexplained' });
};

/**
 * Rewrites one existing section under its own lock.
 *
 * `next` is handed the document the host holds at the moment the lock is
 * taken, so a draft is laid over the section as it stands rather than over
 * whatever the editor read when it opened. It may refuse the draft by
 * throwing, and that refusal is the researcher's. `whenMissing` answers for a
 * section the protocol does not hold yet, when the caller can bring it into
 * being.
 */
async function rewriteSection(
  { adapter, protocolId }: Pick<CreateDeps, 'adapter' | 'protocolId'>,
  id: ProtocolSectionId,
  next: SectionUpdate,
  whenMissing?: () => Promise<CodebookWriteOutcome>,
  promote?: ResourcePromotion,
): Promise<CodebookWriteOutcome> {
  const acquired = await attempt(adapter, 'AcquireLock', {
    protocolId,
    sectionId: id,
  });
  if (!acquired.isSuccess) {
    if (
      whenMissing !== undefined &&
      acquired.refusal?._tag === 'SectionNotFound'
    ) {
      return whenMissing();
    }
    if (acquired.refusal === undefined) {
      // An acquire with no refusal on it never reached an answer: the
      // socket dropped, and the host may well have granted the lock before
      // it did. Studio's lease is renewed for as long as the tab is there,
      // so a lock nobody knows about is one the section's collaborators
      // wait out until the tab closes. Best effort, like every other
      // release: a host that will not take it leaves nothing to act on.
      await attempt(adapter, 'ReleaseLock', { protocolId, sectionId: id });
    }
    return refused(writeRefusal(acquired.refusal));
  }
  if (acquired.data.lock === 'readOnly') {
    return refused(heldRefusal(acquired.data.holder));
  }

  try {
    let document: SectionDoc;
    try {
      document = next(Redacted.value(acquired.data.document));
    } catch (error: unknown) {
      return builderRefusal(error);
    }

    const submitted = await attempt(adapter, 'Submit', {
      protocolId,
      requestId: nextRequestId(),
      sectionId: id,
      document: Redacted.make(document),
      revision: acquired.data.revision,
      ...(promote === undefined ? {} : { promote }),
    });
    if (submitted.isSuccess) return { status: 'applied', sectionId: id };
    return refused(writeRefusal(submitted.refusal));
  } finally {
    await attempt(adapter, 'ReleaseLock', { protocolId, sectionId: id });
  }
}

/**
 * Lays a codebook change over the open stage editor's draft rather than
 * writing it (see `StagedCodebookStore`).
 *
 * Answered as a write is, so a caller cannot tell the two apart and need not:
 * a change the builder refuses is refused in the same words, and one that is
 * kept is `applied` — to the codebook the stage editor shows, which is the one
 * its save will write.
 */
function stageCodebookChange(
  store: StagedCodebookStore,
  id: ProtocolSectionId,
  next: SectionUpdate,
  missing?: SectionDoc,
): CodebookWriteOutcome {
  let refusal: ReturnType<StagedCodebookStore['stage']>;
  try {
    refusal = store.stage(id, next, missing);
  } catch (error: unknown) {
    return builderRefusal(error);
  }
  if (refusal === 'readOnly') {
    return {
      status: 'refused',
      message: READ_ONLY_MESSAGE,
      refusal: { kind: 'held' },
    };
  }
  if (refusal === 'gone') return refused({ kind: 'sectionGone' });
  return { status: 'applied', sectionId: id };
}

/**
 * Rewrites one existing codebook section under its own lock (see
 * `rewriteSection`).
 *
 * Inside a stage editor the change is the stage's instead: it is kept with
 * the stage's draft, saved with the stage and discarded with it (see
 * `StagedCodebookStore`). Files imported for it are the stage edit's own, and
 * are committed by the stage's save, so `promote` is not used there.
 */
export function useCodebookSectionWrite(): (
  subject: CodebookSubject,
  next: SectionUpdate,
  /** Files imported while editing, committed in the same revision. */
  promote?: ResourcePromotion,
) => Promise<CodebookWriteOutcome> {
  const { adapter, protocolId } = useProtocolBuilderContext();
  const queryClient = useQueryClient();
  const stagedCodebook = useStagedCodebookStore();
  // The participant's own section is CREATED by the first attribute, and a
  // create is the one write here a retry can be recognised as.
  const egoKey = useKeptRequestId();

  return useCallback(
    (subject, next, promote) =>
      stagedCodebook !== undefined
        ? Promise.resolve(
            stageCodebookChange(
              stagedCodebook,
              sectionIdForCodebookSubject(subject),
              next,
              // The participant's section is the one a change may bring into
              // being, as the write below does.
              subject.entity === 'ego' ? {} : undefined,
            ),
          )
        : rewriteSection(
            { adapter, protocolId },
            sectionIdForCodebookSubject(subject),
            next,
            // The participant's own attributes are the one part of the codebook a
            // protocol need not have yet: a researcher who has asked the
            // participant nothing has no section to lock, and the first attribute
            // is what brings it into being. `create` mints it and serialises the
            // call, so the write that adds the attribute is also the write that
            // creates the section — there is no empty section to write first.
            subject.entity === 'ego'
              ? () =>
                  createEgoCodebook(
                    { adapter, queryClient, protocolId },
                    egoKey,
                    next,
                    promote,
                  )
              : undefined,
            promote,
          ),
    [adapter, egoKey, protocolId, queryClient, stagedCodebook],
  );
}

/**
 * Adds the participant's first attribute, which is what creates the section
 * holding them.
 *
 * The draft is laid over an empty codebook rather than over a document the
 * host handed back, because there is none: `create` is atomic and takes no
 * lock, so between deciding to create and creating, a collaborator adding the
 * first attribute of their own is answered `SectionExists` rather than
 * overwritten.
 */
async function createEgoCodebook(
  deps: CreateDeps,
  egoKey: KeptRequestId,
  next: SectionUpdate,
  promote?: ResourcePromotion,
): Promise<CodebookWriteOutcome> {
  let document: SectionDoc;
  try {
    document = next({});
  } catch (error: unknown) {
    return builderRefusal(error);
  }
  const { adapter, protocolId } = deps;
  const requestId = egoKey.forAsk(contentHash(document));
  const created = await attempt(adapter, 'Create', {
    protocolId,
    requestId,
    kind: 'codebookEgo',
    document: Redacted.make(document),
    ...(promote === undefined ? {} : { promote }),
  });
  if (created.answered) egoKey.settled(requestId);
  if (created.isSuccess) {
    await readCreatedSection(deps, created.data.sectionId);
    return { status: 'applied', sectionId: created.data.sectionId };
  }
  return refused(writeRefusal(created.refusal));
}

/**
 * Creates a new node or edge type.
 *
 * The host mints the section and the type id inside it and serialises the
 * call, so there is no lock to take and nothing for the caller to reserve.
 *
 * Inside a stage editor the type is the stage's instead, as every codebook
 * change made there is (see `StagedCodebookStore`): its id is minted here, it
 * is kept with the stage's draft, and the stage's save creates it.
 */
export function useCreateCodebookEntity(): (
  entity: 'node' | 'edge',
  document: SectionDoc,
  /** Files imported while editing, committed with the new section. */
  promote?: ResourcePromotion,
) => Promise<CodebookWriteOutcome> {
  const { adapter, protocolId } = useProtocolBuilderContext();
  const queryClient = useQueryClient();
  const createKey = useKeptRequestId();
  const stagedCodebook = useStagedCodebookStore();

  return useCallback(
    async (entity, document, promote) => {
      const kind = entity === 'node' ? 'codebookNode' : 'codebookEdge';
      if (stagedCodebook !== undefined) {
        return stageCodebookChange(
          stagedCodebook,
          sectionId({ kind, typeId: uuid() }),
          () => document,
          {},
        );
      }
      // Kept while the answer is uncertain, so the researcher pressing Save
      // again on a dialog that reported "could not be sent" asks the host
      // about the write it may already have made rather than making a second
      // one: with the socket down, nothing has told this client the type is
      // already there, and the codebook would end up holding two of them.
      const requestId = createKey.forAsk(
        `${kind}\u0000${contentHash(document)}`,
      );
      const created = await attempt(adapter, 'Create', {
        protocolId,
        requestId,
        kind,
        document: Redacted.make(document),
        ...(promote === undefined ? {} : { promote }),
      });
      if (created.answered) createKey.settled(requestId);
      if (created.isSuccess) {
        // Read in before the caller is answered: what it does next is point
        // the stage at the new type.
        await readCreatedSection(
          { adapter, queryClient, protocolId },
          created.data.sectionId,
        );
        return { status: 'applied', sectionId: created.data.sectionId };
      }
      const { refusal } = created;
      // A node or edge type's section is minted by the host, so no
      // collaborator can have made it first, and the sentence for one that
      // did is about the participant's own section.
      return refused(
        refusal?._tag === 'SectionExists'
          ? { kind: 'unreachable' }
          : writeRefusal(refusal),
      );
    },
    [adapter, createKey, protocolId, queryClient, stagedCodebook],
  );
}

/**
 * Removes a variable and every reference to it.
 *
 * A deletion cannot be contained in one section — a prompt naming the
 * attribute is somewhere else entirely — so the host takes every lock it needs
 * or refuses naming who holds one.
 */
export function useDeleteCodebookVariable(): (
  subject: CodebookSubject,
  variableId: string,
) => Promise<CodebookWriteOutcome> {
  const { adapter, protocolId } = useProtocolBuilderContext();

  return useCallback(
    async (subject, variableId) => {
      const removed = await attempt(adapter, 'RefactorDeleteVariable', {
        protocolId,
        subject,
        variableId,
      });
      if (removed.isSuccess) {
        return {
          status: 'applied',
          sectionId: sectionIdForCodebookSubject(subject),
        };
      }
      return refused(writeRefusal(removed.refusal));
    },
    [adapter, protocolId],
  );
}
