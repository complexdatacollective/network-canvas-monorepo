import { createElement, useCallback, useEffect, useMemo } from 'react';
import { useSelector, useStore } from 'react-redux';
import { useLocation, useParams } from 'wouter';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Heading from '@codaco/fresco-ui/typography/Heading';
import { ProtocolBuilder } from '@codaco/protocol-builder/ProtocolBuilder';
import { isStageType } from '@codaco/protocol-builder/stage-types';
import type { StageEditTarget } from '@codaco/protocol-builder/stageEdit';
import StageEditor from '@codaco/protocol-builder/StageEditor';
import { sectionId } from '@codaco/studio-sync/taxonomy';
import StageEditorNav from '~/components/ProjectNav/StageEditorNav';
import { routeFocusTargetProps } from '~/components/RouteFocus';
import {
  readStageDraft,
  useStageDraft,
} from '~/components/StageEditor/stageDraftBeacon';
import StageDraftConflictDialog from '~/components/StageEditor/StageDraftConflictDialog';
import StageEditorChrome from '~/components/StageEditor/StageEditorChrome';
import { getActiveProtocolId } from '~/ducks/modules/app';
import type { RootState } from '~/ducks/store';
import {
  getLeavePersistence,
  guardState,
  stageDiscardDescriptions,
} from '~/hooks/useProtocolNavGuard';
import { createArchitectClient } from '~/protocolBuilder/createArchitectRouter';
import { getProtocol, getStage, getStageIndex } from '~/selectors/protocol';
const messages = defineMessages({
  stageNotFound: {
    id: 'architect.stageEditor.stageEditor.stageNotFound',
    defaultMessage: 'Stage not found',
    description: 'The title text in components / StageEditor / StageEditor.',
  },
  thatStageNoLongerExistsIt: {
    id: 'architect.stageEditor.stageEditor.thatStageNoLongerExistsIt',
    defaultMessage:
      'That stage no longer exists. It may have been deleted. Returning you to the protocol overview.',
    description:
      'The description text in components / StageEditor / StageEditor.',
  },
  oK: {
    id: 'architect.stageEditor.stageEditor.oK',
    defaultMessage: 'OK',
    description: 'The label text in components / StageEditor / StageEditor.',
  },
  discardUnsavedStageChanges: {
    id: 'architect.stageEditor.stageEditor.discardUnsavedStageChanges',
    defaultMessage: 'Discard unsaved stage changes?',
    description: 'The title text in components / StageEditor / StageEditor.',
  },
  discardChangesAndLeave: {
    id: 'architect.stageEditor.stageEditor.discardChangesAndLeave',
    defaultMessage: 'Discard Changes and Leave',
    description: 'The label text in components / StageEditor / StageEditor.',
  },
  newStage: {
    id: 'architect.final.components.StageEditor.StageEditor.newStage',
    defaultMessage: 'New stage',
    description: 'Researcher-facing Architect control or feedback.',
  },
  otherTab: {
    id: 'architect.stageEditor.stageEditorPage.otherTab',
    defaultMessage: 'Another tab',
    description:
      'What an editor calls the browser tab that holds the saved copy of this protocol, when it is not this one. Read as, for example, “Another tab is editing this stage”.',
  },
});

/**
 * The stage editor route: Architect's chrome around the shared editor.
 *
 * Every interface is edited by `@codaco/protocol-builder`, over a client that
 * serves the package's host contract from this tab's own Redux store — so the
 * editor reads and writes the protocol through the same procedures Studio
 * serves over a wire. What stays Architect's is what surrounds one stage:
 * where this route goes next, the toolbar, the preview, the guards that ask
 * about unsaved work, and the recovery flow for a protocol another tab has
 * taken over.
 */
const StageEditorPage = () => {
  const intl = useAppIntl();
  const { stageId: rawStageId } = useParams();
  const [, setLocation] = useLocation();
  const { openDialog } = useDialog();
  const reduxStore = useStore<RootState>();

  // The create flow carries its interface and its place in the interview on the
  // URL, so a new stage can be linked to the way an existing one is.
  const urlParams = new URLSearchParams(window.location.search);
  const rawInsertAtIndex = urlParams.get('insertAtIndex');
  const insertAtIndex =
    rawInsertAtIndex === null ? undefined : Number(rawInsertAtIndex);
  const requestedType = urlParams.get('type');

  // "new" is the create flow rather than a stage id.
  const stageId = rawStageId === 'new' ? null : (rawStageId ?? null);

  const protocol = useSelector(getProtocol);
  const activeProtocolId = useSelector(getActiveProtocolId);
  const stage = useSelector((state: RootState) =>
    getStage(state, stageId ?? ''),
  );
  const stageIndex = useSelector((state: RootState) =>
    getStageIndex(state, stageId ?? ''),
  );

  // A stage URL whose stage the loaded protocol does not have. Guarded on the
  // protocol being loaded, so a load still in flight is not mistaken for a
  // missing stage, and on `stageId`, because the create flow has no stage yet.
  const stageMissing =
    protocol !== null && stageId !== null && stageIndex === -1;

  useEffect(() => {
    if (!stageMissing) return;
    void openDialog({
      type: 'acknowledge',
      intent: 'info',
      title: createElement(AppMessage, { message: messages.stageNotFound }),
      description: createElement(AppMessage, {
        message: messages.thatStageNoLongerExistsIt,
      }),
      actions: {
        primary: {
          label: createElement(AppMessage, { message: messages.oK }),
          value: true,
        },
      },
    });
    setLocation('/protocol');
  }, [openDialog, setLocation, stageMissing]);

  const otherTabName = intl.formatMessage(messages.otherTab);
  // One client per store, because a new one re-opens the protocol channel
  // behind it. The name follows the researcher's language, which changes about
  // as often as the store does.
  const client = useMemo(
    () => createArchitectClient(reduxStore, otherTabName),
    [otherTabName, reduxStore],
  );

  const target = useMemo<StageEditTarget | undefined>(() => {
    if (stageId !== null) {
      return { sectionId: sectionId({ kind: 'stage', stageId }) };
    }
    if (requestedType === null || !isStageType(requestedType)) return undefined;
    // No fields: the package seeds a new stage from the interface's own
    // template, which is the same template Architect used to seed it.
    return {
      stageType: requestedType,
      position: insertAtIndex ?? protocol?.stages.length ?? 0,
    };
  }, [insertAtIndex, protocol?.stages.length, requestedType, stageId]);

  const handleCancel = useCallback(async (): Promise<boolean> => {
    if (!readStageDraft().dirty) {
      setLocation('/protocol');
      return true;
    }

    // One decision, one prompt. Cancel and Back ask the researcher the very
    // same question about the very same draft, so Cancel joins the interlock
    // the navigation guards already share rather than being the one exit that
    // can stack a second identical dialog on top of the first.
    if (guardState.prompting) return false;
    guardState.prompting = true;
    try {
      // What is lost differs with whether this tab can save at all, and a tab
      // that cannot must not be told the last saved version of the stage is
      // waiting for it here.
      const persistence = getLeavePersistence(reduxStore.getState());
      const confirmed = await openDialog({
        type: 'choice',
        intent: 'warning',
        size: 'readable',
        title: createElement(AppMessage, {
          message: messages.discardUnsavedStageChanges,
        }),
        description: createElement(AppMessage, {
          message:
            stageDiscardDescriptions[
              persistence === 'no-protocol' ? 'saved' : persistence
            ],
        }),
        actions: {
          primary: {
            label: createElement(AppMessage, {
              message: messages.discardChangesAndLeave,
            }),
            value: true,
          },
          cancel: {
            label: createElement(AppMessage, {
              message: commonMessages.cancel,
            }),
            value: false,
          },
        },
      });

      if (confirmed) {
        setLocation('/protocol');
        return true;
      }

      return false;
    } finally {
      guardState.prompting = false;
    }
  }, [openDialog, reduxStore, setLocation]);

  // A browser-level exit (refresh, tab close, window close) is the one way out
  // of a dirty editor that no in-app guard can intercept, and the draft lives
  // only in memory — without this it is silently discarded while every in-app
  // exit prompts. The listener is attached for the editor's whole mount, and
  // dirtiness is decided inside the handler, so the edit made a moment before
  // unload still counts. Scoping it to this route keeps the rest of the app
  // eligible for the back/forward cache.
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!readStageDraft().dirty) return;
      // Setting returnValue triggers the browser's native "leave site?"
      // prompt; the string is legacy and ignored by modern browsers.
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  const draftName = useStageDraft((beacon) => beacon.stage?.label);
  const stageName =
    (typeof draftName === 'string' && draftName !== '' ? draftName : null) ??
    stage?.label ??
    intl.formatMessage(messages.newStage);

  const renderChrome = useCallback(
    ({ formId, readOnly }: Readonly<{ formId: string; readOnly: boolean }>) => (
      <StageEditorChrome
        formId={formId}
        readOnly={readOnly}
        stageId={stageId}
        {...(insertAtIndex === undefined ? {} : { insertAtIndex })}
        onCancel={() => void handleCancel()}
      />
    ),
    [handleCancel, insertAtIndex, stageId],
  );

  const handleSaved = useCallback(() => {
    setLocation('/protocol');
  }, [setLocation]);

  // While the stale-URL redirect effect runs, and for a create with no
  // interface to create, there is nothing to edit and nothing to say: the
  // effect above is already on its way to the stage list.
  if (stageMissing || target === undefined || activeProtocolId === null) {
    return null;
  }

  return (
    <div className="relative h-full overflow-y-auto pb-32">
      <StageEditorNav
        stageName={stageName}
        onCancel={() => void handleCancel()}
      />
      <StageDraftConflictDialog
        stageId={stageId}
        insertAtIndex={insertAtIndex}
      />
      <div className="phone-landscape:px-6 px-4">
        <div className="mx-auto w-full max-w-6xl">
          {/*
           * The editor's visible hero heading is the stage-name INPUT, which is
           * a control rather than a heading — so this is the route's real
           * heading and RouteFocus's landing point, and it is `sr-only`
           * because the input already shows the same text at hero size.
           *
           * Focus lands HERE, never on the name input: opening an edit the
           * researcher did not ask for is worse than a silent arrival. The
           * new-stage flow is the deliberate exception — the editor autofocuses
           * the name because naming the stage IS the next step, and RouteFocus
           * leaves any destination that has already claimed focus alone.
           */}
          <Heading level="h1" className="sr-only" {...routeFocusTargetProps}>
            {stageName}
          </Heading>
          {/*
            No `EnclosingHeadingLevel` around the editor: the heading above it
            is this page's `h1`, which is the top of the ladder and what the
            editor already assumes when nothing states otherwise — its own
            stage title lands on `h2` and every section one below that.
          */}
          <ProtocolBuilder client={client} protocolId={activeProtocolId}>
            <StageEditor
              target={target}
              formId={STAGE_FORM_ID}
              actions={renderChrome}
              onSaved={handleSaved}
            />
          </ProtocolBuilder>
        </div>
      </div>
    </div>
  );
};

/**
 * The DOM id of the stage form.
 *
 * Named rather than generated, because the toolbar's save control lives outside
 * the form and reaches it by id, and because every dialog the editor opens
 * derives its own form id from this one.
 */
const STAGE_FORM_ID = 'edit-stage';

export default StageEditorPage;
