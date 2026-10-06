import { useCallback, useContext, useMemo } from 'react';

import { findStageManagedOptionBindings } from '@codaco/protocol-validation';

import { StageEditorFormContext } from '../form/stageEditorContext.ts';
import type { CodebookSubject } from '../protocol-context.ts';
import { stageDocument } from '../stageDocument.ts';
import { useProtocolContext } from '../state/protocolContext.ts';
import {
  buildStageManagedOptionMap,
  stageManagedOptionsLock,
  variableRoleKey,
} from './variableRoles.ts';

/**
 * Asks whether a variable's options may be edited from where the researcher is
 * working, and if not, which stages to name.
 *
 * Some stages manage the option list of the variable they bind, because they
 * attach meaning to each option (see `StageManagedOptionsDescriptor`). The
 * answer is `undefined` when nothing manages the options, or when the
 * researcher is inside the editor of a stage that does, and otherwise the
 * labels of the stages that do — saved ones, which the protocol holds.
 *
 * "Inside the editor of a stage that does" includes a stage that binds the
 * variable only in its unsaved draft, so a new stage pointed at an attribute
 * another stage already manages may edit its options like any other owner. The
 * draft is read when the question is asked, not subscribed to.
 *
 * Outside a stage editor (the codebook's own editor) there is no stage to edit
 * from, so the answer is the saved owners, always.
 */
export function useStageManagedOptionsLock(): (
  subject: CodebookSubject,
  variableId: string,
) => readonly string[] | undefined {
  const protocolContext = useProtocolContext();
  const editor = useContext(StageEditorFormContext);
  const map = useMemo(
    () => buildStageManagedOptionMap(protocolContext),
    [protocolContext],
  );

  return useCallback(
    (subject, variableId) => {
      if (editor === null) {
        return stageManagedOptionsLock(map, subject, variableId);
      }
      const draftBindings = new Set<string>();
      for (const binding of findStageManagedOptionBindings({
        codebook: protocolContext.codebook,
        stages: [stageDocument(editor.identity, editor.liveDraft())],
      })) {
        const entity = binding.subject.entity;
        if (entity === 'ego') {
          draftBindings.add(
            variableRoleKey({ entity: 'ego' }, binding.variableId),
          );
        } else if (binding.subject.type !== undefined) {
          draftBindings.add(
            variableRoleKey(
              { entity, type: binding.subject.type },
              binding.variableId,
            ),
          );
        }
      }
      return stageManagedOptionsLock(map, subject, variableId, {
        stageId: editor.identity.id,
        draftBindings,
      });
    },
    [editor, map, protocolContext.codebook],
  );
}
