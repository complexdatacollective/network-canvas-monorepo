import { safe } from '@orpc/client';
import { useCallback } from 'react';

import type { SectionDoc } from '@codaco/studio-sync/apply';
import {
  sectionId,
  type ProtocolSectionId,
} from '@codaco/studio-sync/taxonomy';

import type { ProtocolBuilderClient } from '../contract/contract.ts';
import type { Presence, SectionReference } from '../contract/schemas.ts';
import { useProtocolBuilderContext } from '../state/context.ts';
import {
  codebookRefusalMessage,
  type CodebookRefusal,
} from './compoundFailureCopy.ts';
import {
  DuplicateVariableNameError,
  MissingVariableError,
  sectionIdForCodebookSubject,
  type CodebookSubject,
} from './editing.ts';

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

/** Every procedure can answer these two; anything else never reached a host. */
const protocolRefusal = (code: string | undefined): CodebookRefusal => {
  if (code === 'PROTOCOL_NOT_FOUND') return { kind: 'protocolGone' };
  if (code === 'SECTION_NOT_FOUND') return { kind: 'sectionGone' };
  return { kind: 'unreachable' };
};

const heldRefusal = (holder: Presence | undefined): CodebookRefusal =>
  holder === undefined
    ? { kind: 'held' }
    : { kind: 'held', holders: [holder.displayName] };

/**
 * The refusal a compound refactor answers with, naming everyone in its way.
 *
 * A refactor writes several sections, so more than one collaborator can be
 * holding it up; a host that would not name one contributes nothing, and a
 * change blocked only by those is refused without a name rather than with a
 * gap in the list.
 */
const blockedRefusal = (
  blocked: readonly Readonly<{ holder?: Presence }>[],
): CodebookRefusal => {
  const holders = [
    ...new Set(
      blocked.flatMap((section) =>
        section.holder === undefined ? [] : [section.holder.displayName],
      ),
    ),
  ];
  return holders.length === 0 ? { kind: 'held' } : { kind: 'held', holders };
};

/**
 * Every way a compound refactor is refused, in the researcher's terms.
 *
 * Both of the contract's refactor errors are answered here rather than falling
 * through to "could not be sent": a change refused because somebody is editing
 * and one refused because the protocol still names what would go are both
 * things the researcher can act on, and both were reported as a connection
 * problem while nothing offered a delete to reach them with.
 */
const refactorRefusal = (
  failure:
    | Readonly<{
        code: 'SECTIONS_LOCKED';
        data: Readonly<{ blocked: readonly Readonly<{ holder?: Presence }>[] }>;
      }>
    | Readonly<{
        code: 'REFERENCES_REMAIN';
        data: Readonly<{ remaining: readonly SectionReference[] }>;
      }>
    | Readonly<{ code: 'PROTOCOL_NOT_FOUND' | 'SECTION_NOT_FOUND' }>
    | null
    | undefined,
): CodebookRefusal => {
  if (failure?.code === 'SECTIONS_LOCKED') {
    return blockedRefusal(failure.data.blocked);
  }
  if (failure?.code === 'REFERENCES_REMAIN') {
    return {
      kind: 'referencesRemain',
      references: failure.data.remaining.length,
    };
  }
  return protocolRefusal(failure?.code);
};

/**
 * What a draft the builder refused says to the researcher.
 *
 * `editing.ts` encodes the two refusals a researcher can act on — a duplicate
 * attribute name, an attribute a collaborator deleted — precisely so they can
 * be passed on and decoded where they are rendered. Everything else it throws
 * reports a wiring defect and is written for whoever reads a log.
 */
const builderRefusal = (error: unknown): CodebookWriteOutcome =>
  error instanceof DuplicateVariableNameError ||
  error instanceof MissingVariableError
    ? {
        status: 'refused',
        message: error.message,
        refusal: { kind: 'unexplained' },
      }
    : refused({ kind: 'unexplained' });

/**
 * Rewrites one existing codebook section under its own lock.
 *
 * `next` is handed the document the host holds at the moment the lock is
 * taken, so a draft is laid over the codebook as it stands rather than over
 * whatever the editor read when it opened. It may refuse the draft by
 * throwing, and that refusal is the researcher's.
 */
export function useCodebookSectionWrite(): (
  subject: CodebookSubject,
  next: (authoritativeDocument: SectionDoc) => SectionDoc,
) => Promise<CodebookWriteOutcome> {
  const { client, protocolId } = useProtocolBuilderContext();

  return useCallback(
    async (subject, next) => {
      const id = sectionIdForCodebookSubject(subject);
      const acquired = await safe(
        client.acquireLock({ protocolId, sectionId: id }),
      );
      if (!acquired.isSuccess) {
        // The participant's own attributes are the one part of the codebook a
        // protocol need not have yet: a researcher who has asked the
        // participant nothing has no section to lock, and the first attribute
        // is what brings it into being. `create` mints it and serialises the
        // call, so the write that adds the attribute is also the write that
        // creates the section — there is no empty section to write first.
        if (
          subject.entity === 'ego' &&
          acquired.definedError?.code === 'SECTION_NOT_FOUND'
        ) {
          return createEgoCodebook(client, protocolId, next);
        }
        return refused(protocolRefusal(acquired.definedError?.code));
      }
      if (acquired.data.lock === 'readOnly') {
        return refused(heldRefusal(acquired.data.holder));
      }

      try {
        let document: SectionDoc;
        try {
          document = next(acquired.data.document);
        } catch (error: unknown) {
          return builderRefusal(error);
        }

        const submitted = await safe(
          client.submit({
            protocolId,
            sectionId: id,
            document,
            revision: acquired.data.revision,
          }),
        );
        if (submitted.isSuccess) return { status: 'applied', sectionId: id };
        const { definedError } = submitted;
        if (definedError?.code === 'NOT_LOCK_HOLDER') {
          return refused(heldRefusal(definedError.data.holder));
        }
        if (definedError?.code === 'INVALID_SHAPE') {
          return refused({ kind: 'invalidShape' });
        }
        return refused(protocolRefusal(definedError?.code));
      } finally {
        await safe(client.releaseLock({ protocolId, sectionId: id }));
      }
    },
    [client, protocolId],
  );
}

/**
 * Adds the participant's first attribute, which is what creates the section
 * holding them.
 *
 * The draft is laid over an empty codebook rather than over a document the
 * host handed back, because there is none: `create` is atomic and takes no
 * lock, so between deciding to create and creating, a collaborator adding the
 * first attribute of their own is answered `SECTION_EXISTS` rather than
 * overwritten.
 */
async function createEgoCodebook(
  client: ProtocolBuilderClient,
  protocolId: string,
  next: (authoritativeDocument: SectionDoc) => SectionDoc,
): Promise<CodebookWriteOutcome> {
  let document: SectionDoc;
  try {
    document = next({});
  } catch (error: unknown) {
    return builderRefusal(error);
  }
  const created = await safe(
    client.create({ protocolId, kind: 'codebookEgo', document }),
  );
  if (created.isSuccess) {
    return { status: 'applied', sectionId: created.data.sectionId };
  }
  const { definedError } = created;
  if (definedError?.code === 'INVALID_SHAPE') {
    return refused({ kind: 'invalidShape' });
  }
  if (definedError?.code === 'SECTION_EXISTS') {
    return refused({ kind: 'sectionCreatedElsewhere' });
  }
  return refused(protocolRefusal(definedError?.code));
}

/**
 * Creates a new node or edge type.
 *
 * The host mints the section and the type id inside it and serialises the
 * call, so there is no lock to take and nothing for the caller to reserve.
 */
export function useCreateCodebookEntity(): (
  entity: 'node' | 'edge',
  document: SectionDoc,
) => Promise<CodebookWriteOutcome> {
  const { client, protocolId } = useProtocolBuilderContext();

  return useCallback(
    async (entity, document) => {
      const created = await safe(
        client.create({
          protocolId,
          kind: entity === 'node' ? 'codebookNode' : 'codebookEdge',
          document,
        }),
      );
      if (created.isSuccess) {
        return { status: 'applied', sectionId: created.data.sectionId };
      }
      const { definedError } = created;
      if (definedError?.code === 'INVALID_SHAPE') {
        return refused({ kind: 'invalidShape' });
      }
      return refused(protocolRefusal(definedError?.code));
    },
    [client, protocolId],
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
  const { client, protocolId } = useProtocolBuilderContext();

  return useCallback(
    async (subject, variableId) => {
      const removed = await safe(
        client.refactor.deleteVariable({ protocolId, subject, variableId }),
      );
      if (removed.isSuccess) {
        return {
          status: 'applied',
          sectionId: sectionIdForCodebookSubject(subject),
        };
      }
      return refused(refactorRefusal(removed.definedError));
    },
    [client, protocolId],
  );
}

/** Removes an entity type, its section, and every reference to it. */
export function useDeleteCodebookEntity(): (
  entity: 'node' | 'edge',
  typeId: string,
) => Promise<CodebookWriteOutcome> {
  const { client, protocolId } = useProtocolBuilderContext();

  return useCallback(
    async (entity, typeId) => {
      const removed = await safe(
        client.refactor.deleteEntityType({ protocolId, entity, typeId }),
      );
      if (removed.isSuccess) {
        return {
          status: 'applied',
          sectionId: sectionId({
            kind: entity === 'node' ? 'codebookNode' : 'codebookEdge',
            typeId,
          }),
        };
      }
      return refused(refactorRefusal(removed.definedError));
    },
    [client, protocolId],
  );
}
