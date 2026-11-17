import type { QueryClient } from '@tanstack/react-query';
import { Redacted } from 'effect';
import { isEqual } from 'es-toolkit';

import type {
  Revision,
  SectionAtRevisionSchema,
  StageCodebookSection,
} from '@codaco/protocol-builder-core/contract/schemas';
import type { InterfaceTextUpdate } from '@codaco/protocol-validation';
import { contentHash, type SectionDoc } from '@codaco/studio-sync/apply';
import {
  parseSectionId,
  sectionId,
  type ProtocolSectionId,
} from '@codaco/studio-sync/taxonomy';

import { attempt } from './attempt.ts';
import { listWrittenSection } from './channel.ts';
import type { CodebookRefusal } from './codebookRefusal.ts';
import type { ProtocolBuilderAdapter } from './context.ts';
import { mergeSection, type StagedCodebook } from './stagedCodebook.ts';

/** One codebook section as a stage's save will leave it. */
export type CodebookSectionWrite = Readonly<{
  sectionId: ProtocolSectionId;
  document: SectionDoc;
}>;

/**
 * The codebook a stage's save carries: the sections as it will write them,
 * and the researcher's changes they were made from.
 */
export type CodebookSave = Readonly<{
  sections: readonly CodebookSectionWrite[];
  /**
   * What the researcher changed, which names the save (`stageAskHash`): the
   * sections are made from it and from the protocol as it stood when the save
   * was asked for, so a retry finds them different once the first attempt has
   * landed.
   */
  staged: StagedCodebook;
}>;

/** The contract's `codebook` for a stage write, or nothing to send. */
export function codebookPayload(
  codebook: CodebookSave | undefined,
): readonly [StageCodebookSection, ...StageCodebookSection[]] | undefined {
  const [first, ...rest] = (codebook?.sections ?? []).map((section) => ({
    sectionId: section.sectionId,
    document: Redacted.make(section.document),
  }));
  return first === undefined ? undefined : [first, ...rest];
}

/**
 * Puts the codebook sections a stage's save wrote into the read cache, at the
 * revision the host answered with.
 *
 * The saved stage stops holding its codebook changes as soon as the save
 * lands, and everything that read the codebook through them reads the
 * protocol's own sections again. Left to the channel, those are the sections
 * from before the save until its event arrives, so a type or attribute the
 * save just wrote would vanish from the editor for that moment. A section the
 * cache already holds at this revision or a later one (the event got here
 * first) is left as it is.
 */
export function cacheSavedCodebook(
  queryClient: QueryClient,
  adapter: ProtocolBuilderAdapter,
  protocolId: string,
  codebook: CodebookSave | undefined,
  revision: Revision,
): void {
  const deps = { adapter, queryClient, protocolId };
  for (const section of codebook?.sections ?? []) {
    queryClient.setQueryData<(typeof SectionAtRevisionSchema)['Type']>(
      adapter.rpcKey('GetSection', {
        protocolId,
        sectionId: section.sectionId,
      }),
      (cached) =>
        cached !== undefined && cached.revision.sequence >= revision.sequence
          ? cached
          : {
              document: Redacted.make(section.document),
              // The save's place in the protocol's history, and the hash of
              // this section's own document: what a section's revision says
              // everywhere else, and what derivations of it are keyed by.
              revision: {
                sequence: revision.sequence,
                contentHash: contentHash(section.document),
              },
            },
    );
    // A section the save created is one the protocol's list does not hold yet
    // either: without it, the type or attribute would be passed over by
    // everything that enumerates sections until the event arrives.
    listWrittenSection(deps, section.sectionId);
  }
}

/**
 * What one stage save asks for, as the key its request id is kept under.
 *
 * Everything written in the save's revision is part of it — the stage, the
 * shared words, the codebook changes — so a save of the same stage with
 * anything different beside it is a different ask, and a retry of the same one
 * is recognised as the same. The codebook changes are named by what the
 * researcher changed, never by the sections a save made of them: those are laid
 * over the protocol as it stands, and once an attempt whose answer was lost has
 * landed, the retry's sections are different (or none) though it asks for the
 * same thing. The keys of a stage written with nothing beside it are unchanged
 * from before anything could be.
 */
export function stageAskHash(
  document: SectionDoc,
  interfaceText: readonly InterfaceTextUpdate[] | undefined,
  codebook: StagedCodebook | undefined,
): string {
  const words =
    interfaceText === undefined || interfaceText.length === 0
      ? undefined
      : interfaceText;
  const changes =
    codebook === undefined || Object.keys(codebook).length === 0
      ? undefined
      : codebook;
  if (words === undefined && changes === undefined) {
    return contentHash(document);
  }
  return contentHash({
    document,
    ...(words === undefined ? {} : { interfaceText: words }),
    ...(changes === undefined ? {} : { codebook: changes }),
  });
}

/** The codebook a stage save writes, with the locks that keep it current. */
type HeldCodebook =
  | Readonly<{
      status: 'held';
      /** Every changed section, as the save will write it. */
      sections: readonly CodebookSectionWrite[];
      /** Gives back every lock taken for the save. Best effort. */
      release: () => Promise<void>;
    }>
  | Readonly<{ status: 'refused'; refusal: CodebookRefusal }>;

const NOTHING_HELD: HeldCodebook = Object.freeze({
  status: 'held',
  sections: Object.freeze([]),
  release: async () => undefined,
});

/**
 * Lays a stage's codebook changes over the sections they change, as the
 * protocol holds them now, and holds those sections until the save is made.
 *
 * Each changed section is locked first, so nobody can write it between this
 * reading of it and the stage's save writing it back (the host lets a write
 * through a lock the writer itself holds). The changes are then laid over the
 * document the lock hands back (`mergeEdit`), which is the same rule each
 * codebook write followed when it was made at once: over the section as the
 * host holds it at the moment the lock is granted, not over the copy the
 * editor was looking at.
 *
 * A section the protocol does not hold any more is passed over unless the
 * stage created it: the edits made to a type a collaborator deleted go with
 * it. A section somebody else is editing refuses the save, naming them, and
 * the stage keeps every change for the researcher to save again.
 */
async function holdStagedCodebook(
  adapter: ProtocolBuilderAdapter,
  protocolId: string,
  staged: StagedCodebook,
): Promise<HeldCodebook> {
  const ids = Object.keys(staged);
  if (ids.length === 0) return NOTHING_HELD;

  const locked: ProtocolSectionId[] = [];
  const release = async () => {
    await Promise.all(
      locked.map((id) =>
        attempt(adapter, 'ReleaseLock', { protocolId, sectionId: id }),
      ),
    );
  };
  const sections: CodebookSectionWrite[] = [];

  for (const key of ids) {
    const entry = staged[key];
    if (entry === undefined) continue;
    const id = sectionId(parseSectionId(key));
    const acquired = await attempt(adapter, 'AcquireLock', {
      protocolId,
      sectionId: id,
    });
    if (!acquired.isSuccess) {
      if (acquired.refusal?._tag === 'SectionNotFound') {
        if (entry.base === null) {
          sections.push({ sectionId: id, document: entry.edited });
        }
        continue;
      }
      if (acquired.refusal === undefined) {
        // Never answered: the host may have granted it before the socket
        // dropped, and a lock nobody knows about is one collaborators wait out.
        locked.push(id);
      }
      await release();
      return {
        status: 'refused',
        refusal:
          acquired.refusal?._tag === 'ProtocolNotFound'
            ? { kind: 'protocolGone' }
            : { kind: 'unreachable' },
      };
    }
    const { data } = acquired;
    if (data.lock === 'readOnly') {
      await release();
      return {
        status: 'refused',
        refusal:
          data.holder === undefined
            ? { kind: 'held' }
            : {
                kind: 'held',
                holders: [Redacted.value(data.holder.displayName)],
              },
      };
    }
    locked.push(id);
    const authoritative = Redacted.value(data.document);
    const merged = mergeSection(entry, authoritative);
    if (!isEqual(merged, authoritative)) {
      sections.push({ sectionId: id, document: merged });
    }
  }

  return { status: 'held', sections, release };
}

/**
 * Makes a stage's save with its codebook changes held for it
 * (`holdStagedCodebook`), giving every lock back once the save is answered.
 * A codebook that cannot be held answers with its refusal, and nothing is
 * written.
 */
export async function withStagedCodebook<T>(
  adapter: ProtocolBuilderAdapter,
  protocolId: string,
  staged: StagedCodebook,
  write: (codebook: CodebookSave) => Promise<T>,
): Promise<T | Readonly<{ status: 'refused'; refusal: CodebookRefusal }>> {
  const held = await holdStagedCodebook(adapter, protocolId, staged);
  if (held.status === 'refused') return held;
  try {
    return await write({ sections: held.sections, staged });
  } finally {
    await held.release();
  }
}
