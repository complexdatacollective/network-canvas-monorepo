import { createElement } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { AppMessage } from '@codaco/app-i18n/react';
import type {
  ChoiceDialog,
  DialogContextType,
} from '@codaco/fresco-ui/dialogs/DialogProvider';
import { hasDirtyNestedDraft } from '~/components/DialogForm/nestedDraftRegistry';
import { showProtocolOpenResultDialog } from '~/components/protocolOpenDialogs';
import { readStageDraft } from '~/components/StageEditor/stageDraftBeacon';
import {
  openLocalNetcanvas,
  planLegacyProtocolOpen,
  upgradeLegacyProtocol,
} from '~/ducks/modules/userActions/userActions';
import { type AppDispatch, store } from '~/ducks/store';
import {
  getLeavePersistence,
  isProtocolPath,
  promptLeaveEditor,
} from '~/hooks/useProtocolNavGuard';
import { whenCriticalOperationsSettle } from '~/utils/criticalOperation';
import { discardHandoff, stageHandoff } from '~/utils/handoffStore';
import {
  type BundledLegacyArchitect,
  getBundledLegacyArchitect,
  goToLegacyArchitect,
  LEGACY_ARCHITECT_MAJOR,
  legacyImportUrl,
  legacyOpenUrl,
} from '~/utils/legacyArchitect';
import { recordLegacyProtocolKept } from '~/utils/protocolLibrary';
import { reportError } from '~/utils/reportError';

import { legacyProtocolMessages } from './legacyProtocolMessages';

// Every way of opening a protocol made for an older schema ends here, so the
// researcher meets one dialog and one set of outcomes wherever they started:
// the library, Open file and drag-and-drop on Home, a file the OS launched
// Architect with, and a file Architect 8 handed over (`/?import=`). The choice
// is the same everywhere — upgrade a copy into this app, or keep editing the
// protocol unchanged in the bundled Architect 8 — and only what "keep" does
// differs: a file is staged for Architect 8 to import, a library row is opened
// from Architect 8's own library, where it already is.

type OpenFlowContext = {
  dispatch: AppDispatch;
  openDialog: DialogContextType['openDialog'];
  /**
   * Shows the caller's busy state around work that is not a dialog. Never
   * wraps a dialog: the overlay would sit above it and block its buttons.
   */
  runAction?: <T>(action: () => Promise<T>) => Promise<T>;
  /** Where focus goes when a dialog closes and its opener has gone. */
  finalFocus?: ChoiceDialog['finalFocus'];
};

const runDirectly = <T>(action: () => Promise<T>): Promise<T> => action();

/**
 * Leave this app for Architect 8 by a full page load, after the editor's own
 * rules for leaving: an open protocol gets the leave-editor prompt (which also
 * covers an unsaved stage or nested editor), and every commit already accepted
 * — and any import or export under way — finishes before the page goes.
 * Resolves to whether it left.
 */
const leaveForLegacyArchitect = async (
  { dispatch, openDialog }: OpenFlowContext,
  url: string,
): Promise<boolean> => {
  const leave = async () => {
    await whenCriticalOperationsSettle();
    goToLegacyArchitect(url);
  };
  const persistence = getLeavePersistence(store.getState());
  if (
    !isProtocolPath(window.location.pathname) ||
    persistence === 'no-protocol'
  ) {
    await leave();
    return true;
  }
  let left = false;
  await promptLeaveEditor(
    dispatch,
    openDialog,
    async () => {
      left = true;
      await leave();
    },
    readStageDraft().dirty || hasDirtyNestedDraft(),
    persistence,
    'architect-8',
  );
  return left;
};

/**
 * Hand a `.netcanvas` file, unchanged, to Architect 8: stage it in the
 * hand-off store and navigate to `/v8/?import=<key>`, where Architect 8 imports
 * it through its own Open file. There is no in-memory fallback across a page
 * load, so a file that cannot be staged is reported and nothing else happens.
 */
const keepFileInLegacyArchitect = async (
  file: File,
  architect: BundledLegacyArchitect,
  context: OpenFlowContext,
): Promise<void> => {
  const run = context.runAction ?? runDirectly;
  let key: string;
  try {
    key = await run(() =>
      stageHandoff({ targetMajor: 8, file, fileName: file.name }),
    );
  } catch (error: unknown) {
    reportError(error, { operation: 'handoff-stage' });
    await context.openDialog({
      type: 'acknowledge',
      intent: 'destructive',
      title: createElement(AppMessage, {
        message: legacyProtocolMessages.couldNotOpenInArchitect,
        values: { version: LEGACY_ARCHITECT_MAJOR },
      }),
      description: createElement(AppMessage, {
        message: legacyProtocolMessages.handoffFailed,
        values: { version: LEGACY_ARCHITECT_MAJOR },
      }),
      actions: {
        primary: {
          label: createElement(AppMessage, { message: commonMessages.close }),
          value: true,
        },
      },
      finalFocus: context.finalFocus,
    });
    return;
  }
  const left = await leaveForLegacyArchitect(
    context,
    legacyImportUrl(architect, key),
  );
  if (!left) {
    await discardHandoff(key).catch((error: unknown) => {
      reportError(error, { operation: 'handoff-discard' });
    });
  }
};

/**
 * Open a `.netcanvas` file: Open file and drag-and-drop on Home, a file the OS
 * launched Architect with, and one Architect 8 handed over.
 */
export const openNetcanvasFile = async ({
  file,
  ...context
}: OpenFlowContext & { file: File }): Promise<void> => {
  const run = context.runAction ?? runDirectly;
  const architect = getBundledLegacyArchitect();
  const open = async (migrationApproved = false): Promise<void> => {
    const result = await run(() =>
      context
        .dispatch(openLocalNetcanvas({ file, migrationApproved }))
        .unwrap(),
    );
    await showProtocolOpenResultDialog({
      result,
      openDialog: context.openDialog,
      finalFocus: context.finalFocus,
      onApproveMigration: migrationApproved ? undefined : () => open(true),
      onKeepLegacy:
        migrationApproved || !architect
          ? undefined
          : () => keepFileInLegacyArchitect(file, architect, context),
    });
  };
  await open();
};

const upgradeLegacyProtocolAndReport = async (
  legacyId: string,
  context: OpenFlowContext,
): Promise<void> => {
  const run = context.runAction ?? runDirectly;
  const result = await run(() =>
    context.dispatch(upgradeLegacyProtocol({ legacyId })).unwrap(),
  );
  await showProtocolOpenResultDialog({
    result,
    openDialog: context.openDialog,
    finalFocus: context.finalFocus,
  });
};

/**
 * Open the protocol in Architect 8's library with this id in Architect 8
 * itself. Not offered (and a no-op) when this build bundles no Architect 8.
 */
export const openInLegacyArchitect = async ({
  legacyId,
  ...context
}: OpenFlowContext & { legacyId: string }): Promise<void> => {
  const architect = getBundledLegacyArchitect();
  if (!architect) return;
  await leaveForLegacyArchitect(context, legacyOpenUrl(architect, legacyId));
};

/**
 * Open a protocol from Architect 8's library, listed in this app's library.
 *
 * A protocol the researcher chose to keep in Architect 8 goes straight there.
 * Anything else gets the choice: upgrading makes a copy in this library (the
 * Architect 8 original is never written), keeping it opens it in Architect 8
 * and remembers that for next time.
 */
export const openLegacyLibraryProtocol = async ({
  legacyId,
  ...context
}: OpenFlowContext & { legacyId: string }): Promise<void> => {
  const run = context.runAction ?? runDirectly;
  const plan = await run(() => planLegacyProtocolOpen(legacyId));
  if (plan.status === 'refused') {
    await showProtocolOpenResultDialog({
      result: plan.result,
      openDialog: context.openDialog,
      finalFocus: context.finalFocus,
    });
    return;
  }
  const architect = getBundledLegacyArchitect();
  if (architect && plan.choice?.choice === 'legacy') {
    await leaveForLegacyArchitect(context, legacyOpenUrl(architect, legacyId));
    return;
  }
  await showProtocolOpenResultDialog({
    result: plan.result,
    openDialog: context.openDialog,
    finalFocus: context.finalFocus,
    onApproveMigration: () => upgradeLegacyProtocolAndReport(legacyId, context),
    onKeepLegacy: architect
      ? async () => {
          // Remembering is a convenience; failing to remember must not stop
          // the researcher getting to their protocol.
          await recordLegacyProtocolKept(legacyId).catch((error: unknown) => {
            reportError(error, { operation: 'legacy-choice-record' });
          });
          await leaveForLegacyArchitect(
            context,
            legacyOpenUrl(architect, legacyId),
          );
        }
      : undefined,
  });
};

/**
 * Offer to upgrade a protocol from Architect 8's library, and nothing else:
 * the library menu's "Upgrade to schema 9", and Architect 8's own Upgrade
 * action arriving as `/?upgrade=<id>`. The researcher has already chosen to
 * upgrade, so an earlier decision to keep it in Architect 8 does not apply.
 * The migration notes are still shown before anything is made.
 */
export const confirmLegacyProtocolUpgrade = async ({
  legacyId,
  ...context
}: OpenFlowContext & { legacyId: string }): Promise<void> => {
  const run = context.runAction ?? runDirectly;
  const plan = await run(() => planLegacyProtocolOpen(legacyId));
  await showProtocolOpenResultDialog({
    result: plan.result,
    openDialog: context.openDialog,
    finalFocus: context.finalFocus,
    onApproveMigration:
      plan.status === 'ready'
        ? () => upgradeLegacyProtocolAndReport(legacyId, context)
        : undefined,
  });
};
