import { useQueryClient } from '@tanstack/react-query';
import { Redacted } from 'effect';
import { useContext, useMemo, type ReactNode } from 'react';

import { FormStoreContext } from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { FieldValue } from '@codaco/fresco-ui/form/store/types';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import type { ProtocolSectionId } from '@codaco/studio-sync/taxonomy';

import { STAGED_CODEBOOK_PATH } from '../stageDocument.ts';
import { useStageEdit } from '../stageEdit.tsx';
import { useProtocolBuilderContext } from '../state/context.ts';
import type { CachedSection } from '../state/hooks.ts';
import {
  NOTHING_STAGED,
  StagedCodebookContext,
  stageSectionChange,
  type StagedCodebook,
  type StagedCodebookStore,
} from '../state/stagedCodebook.ts';
import type { StageFormStoreApi } from './stageEditorContext.ts';

const isStagedCodebook = (value: unknown): value is StagedCodebook =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Parks a stage's codebook changes in a form's store, or takes them away when
 * there are none — so a form whose codebook changes have all been undone is as
 * clean as one that never had any.
 */
const park = (storeApi: StageFormStoreApi, changes: StagedCodebook) => {
  storeApi.getState().setFieldValue(
    STAGED_CODEBOOK_PATH,
    Object.keys(changes).length === 0
      ? undefined
      : // The form store holds a document's values, and a section is one:
        // plain records of plain values.
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        (changes as unknown as FieldValue),
  );
};

/**
 * The stage form's codebook store (see `StagedCodebookStore`), parked in the
 * stage form's own store (`STAGED_CODEBOOK_PATH`) so that the changes are part
 * of the stage's draft in every way a host can see: they make it dirty, are
 * thrown away with it, and are written by its save.
 *
 * Mounted inside the stage form's store and above everything the form draws,
 * so the editor's own reading of the protocol — the problems a save is judged
 * by among them — is made with the changes laid over it. A new form store is a
 * new store here too: a draft that is discarded takes its codebook changes
 * with it.
 */
export function StagedCodebookProvider({
  children,
}: Readonly<{ children: ReactNode }>) {
  const storeApi = useContext(FormStoreContext);
  const { access } = useStageEdit();
  const { adapter, protocolId } = useProtocolBuilderContext();
  const queryClient = useQueryClient();
  const writable = access === 'editing';

  const store = useMemo<StagedCodebookStore | undefined>(() => {
    if (storeApi === undefined) return undefined;
    const read = (): StagedCodebook => {
      const held = storeApi.getState().getValue(STAGED_CODEBOOK_PATH);
      return isStagedCodebook(held) ? held : NOTHING_STAGED;
    };
    /** The protocol's own section, as this client last read it. */
    const current = (id: ProtocolSectionId): SectionDoc | undefined => {
      const cached = queryClient.getQueryData<CachedSection>(
        adapter.rpcKey('GetSection', { protocolId, sectionId: id }),
      );
      return cached === undefined ? undefined : Redacted.value(cached.document);
    };
    return {
      read,
      subscribe: (listener) => storeApi.subscribe(listener),
      writable,
      stage: (id, update, missing) => {
        if (!writable) return 'readOnly';
        const next = stageSectionChange(
          read(),
          id,
          current(id),
          update,
          missing,
        );
        if (next === 'gone') return 'gone';
        park(storeApi, next);
        return undefined;
      },
      restore: (checkpoint) => {
        if (read() !== checkpoint) park(storeApi, checkpoint);
      },
    };
  }, [adapter, protocolId, queryClient, storeApi, writable]);

  return (
    <StagedCodebookContext value={store}>{children}</StagedCodebookContext>
  );
}
