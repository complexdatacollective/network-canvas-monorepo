import { type ReactNode, useCallback, useEffect, useRef } from 'react';
import { useStore } from 'react-redux';
import { v4 as uuid } from 'uuid';

import { useDialogSession } from '@codaco/fresco-ui/dialogs/useDialogSession';
import { focusRouteTarget } from '@codaco/fresco-ui/navigation/RouteFocus';
import CodebookEntityEditorDialog, {
  type CodebookEntityEditorSession,
} from '@codaco/protocol-builder/codebook/components/CodebookEntityEditorDialog';
import CreateCodebookVariableDialog, {
  type CreateCodebookVariableSession,
} from '@codaco/protocol-builder/codebook/components/CreateCodebookVariableDialog';
import { ProtocolBuilder } from '@codaco/protocol-builder/ProtocolBuilder';
import { registerNestedDraft } from '~/components/DialogForm/nestedDraftRegistry';
import { useAppSelector } from '~/ducks/hooks';
import { getActiveProtocolId } from '~/ducks/modules/app';
import type { RootState } from '~/ducks/store';
import { useProtocolReadOnly } from '~/hooks/useProtocolReadOnly';
import { useArchitectClient } from '~/protocolBuilder/useArchitectClient';
import { useOtherTabName } from '~/protocolBuilder/useOtherTabName';
import { getCodebook } from '~/selectors/protocol';

import type { CodebookLink } from './codebookLinks';
import type { Entity } from './EntityType';

type EntitySession = CodebookEntityEditorSession &
  Readonly<{ fromLink: boolean }>;

type CodebookEditors = Readonly<{
  /** Opens the editor for a node or edge type, or for a new one. */
  editEntity(entity: Entity, type?: string): void;
  /** Opens the editor for a new attribute of a type, or of the ego. */
  addVariable(entity: Entity, type?: string): void;
  /** The open dialogs, rendered once by whoever owns the triggers. */
  dialogs: ReactNode;
}>;

// A dialog opened by a link has no trigger on this page to return focus to.
const returnFocusToHeading = () => focusRouteTarget() ?? true;

/**
 * The codebook's editors, which are protocol-builder's own, hosted for the
 * Codebook's list.
 *
 * `link` names a type whose editor a URL asked to open; `onLinkClosed` is told
 * when that editor closes, so the page can drop the link.
 */
export function useCodebookEditors(
  link?: CodebookLink,
  onLinkClosed?: () => void,
): CodebookEditors {
  const store = useStore<RootState>();
  const client = useArchitectClient(store, useOtherTabName());
  const protocolId = useAppSelector(getActiveProtocolId);
  const readOnly = useProtocolReadOnly();
  const entityEditor = useDialogSession<EntitySession>();
  const variableEditor = useDialogSession<CreateCodebookVariableSession>();
  const openEntity = entityEditor.openSession;
  const openVariable = variableEditor.openSession;

  // A link to a type that no longer exists opens nothing.
  const linkedTypeExists = useAppSelector(
    (state) =>
      link !== undefined &&
      getCodebook(state)?.[link.entity]?.[link.type] !== undefined,
  );
  const linkedEntity = linkedTypeExists ? link?.entity : undefined;
  const linkedType = linkedTypeExists ? link?.type : undefined;
  useEffect(() => {
    if (linkedEntity === undefined || linkedType === undefined) return;
    openEntity({
      key: uuid(),
      entity: linkedEntity,
      typeId: linkedType,
      mode: 'edit',
      fromLink: true,
    });
  }, [linkedEntity, linkedType, openEntity]);

  const editEntity = useCallback(
    (entity: Entity, type?: string) => {
      if (entity === 'ego') return;
      openEntity({
        key: uuid(),
        entity,
        typeId: type ?? uuid(),
        mode: type === undefined ? 'create' : 'edit',
        fromLink: false,
      });
    },
    [openEntity],
  );

  const addVariable = useCallback(
    (entity: Entity, type?: string) => {
      if (entity !== 'ego' && type === undefined) return;
      openVariable({
        key: uuid(),
        subject:
          entity === 'ego' || type === undefined
            ? { entity: 'ego' }
            : { entity, type },
        variableId: uuid(),
      });
    },
    [openVariable],
  );

  const onLinkClosedRef = useRef(onLinkClosed);
  useEffect(() => {
    onLinkClosedRef.current = onLinkClosed;
  });
  const entitySession = entityEditor.session;
  const closeEntity = entityEditor.closeSession;
  const closeEntityEditor = useCallback(() => {
    closeEntity();
    if (entitySession?.fromLink === true) onLinkClosedRef.current?.();
  }, [closeEntity, entitySession?.fromLink]);

  const dialogs =
    protocolId === null ? null : (
      // An open editor counts as one of Architect's own nested editors, so
      // the tab lock, the read-only demotion and a refresh all ask about its
      // unsaved work.
      <ProtocolBuilder
        adapter={client.adapter}
        protocolId={protocolId}
        dialogDraftRegistrar={registerNestedDraft}
      >
        {entitySession !== null && (
          <CodebookEntityEditorDialog
            session={entitySession}
            onClose={closeEntityEditor}
            onExitComplete={entityEditor.onSessionExited}
            readOnly={readOnly}
            {...(entitySession.fromLink
              ? { finalFocus: returnFocusToHeading }
              : {})}
          />
        )}
        {variableEditor.session !== null && (
          <CreateCodebookVariableDialog
            session={variableEditor.session}
            onClose={variableEditor.closeSession}
            onExitComplete={variableEditor.onSessionExited}
            readOnly={readOnly}
          />
        )}
      </ProtocolBuilder>
    );

  return { editEntity, addVariable, dialogs };
}
