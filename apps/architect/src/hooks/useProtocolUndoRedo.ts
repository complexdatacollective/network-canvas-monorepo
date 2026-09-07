import {
  type IntlShape,
  createAppIntl,
  defineMessages,
} from '@codaco/app-i18n/messages';

const defaultIntl = createAppIntl({ locale: 'en' });
import { useCallback, useMemo } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import { useAccessibilityAnnouncements } from '@codaco/fresco-ui/dnd/useAccessibilityAnnouncements';
import { useAppDispatch, useAppSelector } from '~/ducks/hooks';
import {
  redoWithNavigation,
  undoWithNavigation,
} from '~/ducks/modules/activeProtocol';
import { getCanRedo, getCanUndo } from '~/selectors/protocol';
const utilityMessages = defineMessages({
  changeUndoneMovedToStagesTo: {
    id: 'architect.utility.hooks.useProtocolUndoRedo.changeUndoneMovedToStagesTo',
    defaultMessage: 'Change undone. Moved to Stages to show the result.',
    description:
      'Researcher-facing explanatory text in hooks / useProtocolUndoRedo.',
  },
  changeUndoneMovedToResourcesTo: {
    id: 'architect.utility.hooks.useProtocolUndoRedo.changeUndoneMovedToResourcesTo',
    defaultMessage: 'Change undone. Moved to Resources to show the result.',
    description:
      'Researcher-facing explanatory text in hooks / useProtocolUndoRedo.',
  },
  changeUndoneMovedToCodebookTo: {
    id: 'architect.utility.hooks.useProtocolUndoRedo.changeUndoneMovedToCodebookTo',
    defaultMessage: 'Change undone. Moved to Codebook to show the result.',
    description:
      'Researcher-facing explanatory text in hooks / useProtocolUndoRedo.',
  },
  changeUndone: {
    id: 'architect.utility.hooks.useProtocolUndoRedo.changeUndone',
    defaultMessage: 'Change undone.',
    description:
      'Researcher-facing explanatory text in hooks / useProtocolUndoRedo.',
  },
  changeRedoneMovedToStagesTo: {
    id: 'architect.utility.hooks.useProtocolUndoRedo.changeRedoneMovedToStagesTo',
    defaultMessage: 'Change redone. Moved to Stages to show the result.',
    description:
      'Researcher-facing explanatory text in hooks / useProtocolUndoRedo.',
  },
  changeRedoneMovedToResourcesTo: {
    id: 'architect.utility.hooks.useProtocolUndoRedo.changeRedoneMovedToResourcesTo',
    defaultMessage: 'Change redone. Moved to Resources to show the result.',
    description:
      'Researcher-facing explanatory text in hooks / useProtocolUndoRedo.',
  },
  changeRedoneMovedToCodebookTo: {
    id: 'architect.utility.hooks.useProtocolUndoRedo.changeRedoneMovedToCodebookTo',
    defaultMessage: 'Change redone. Moved to Codebook to show the result.',
    description:
      'Researcher-facing explanatory text in hooks / useProtocolUndoRedo.',
  },
  changeRedone: {
    id: 'architect.utility.hooks.useProtocolUndoRedo.changeRedone',
    defaultMessage: 'Change redone.',
    description:
      'Researcher-facing explanatory text in hooks / useProtocolUndoRedo.',
  },
});

type ProtocolUndoRedo = {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
};

// Whole sentences rather than assembled fragments, so they can be localised
// later without depending on English word order (see the repo's i18n rules).
// `navigatedTo` is the page the operation moved the researcher to, and matches
// the targets `resolveTimelineNavTarget` can produce. Destinations are named
// exactly as ProjectNav labels them, so what a researcher hears matches the
// page they arrive on.
const undoAnnouncement = (
  navigatedTo: string | null,
  intl: IntlShape = defaultIntl,
): string => {
  switch (navigatedTo) {
    case '/protocol':
      return intl.formatMessage(utilityMessages.changeUndoneMovedToStagesTo);
    case '/protocol/assets':
      return intl.formatMessage(utilityMessages.changeUndoneMovedToResourcesTo);
    case '/protocol/codebook':
      return intl.formatMessage(utilityMessages.changeUndoneMovedToCodebookTo);
    case null:
    default:
      return intl.formatMessage(utilityMessages.changeUndone);
  }
};

const redoAnnouncement = (
  navigatedTo: string | null,
  intl: IntlShape = defaultIntl,
): string => {
  switch (navigatedTo) {
    case '/protocol':
      return intl.formatMessage(utilityMessages.changeRedoneMovedToStagesTo);
    case '/protocol/assets':
      return intl.formatMessage(utilityMessages.changeRedoneMovedToResourcesTo);
    case '/protocol/codebook':
      return intl.formatMessage(utilityMessages.changeRedoneMovedToCodebookTo);
    case null:
    default:
      return intl.formatMessage(utilityMessages.changeRedone);
  }
};

/**
 * Undo/redo for the protocol timeline.
 *
 * This used to branch on the route because the stage editor's draft history
 * was also driven from Redux. It is now driven from the stage form store, so
 * the stage editor uses `useStageDraftHistory` from inside `StageForm`
 * instead — and `StageEditorPage` renders outside `ProjectLayout`, so this
 * hook's remaining consumers are never on screen in the stage editor.
 *
 * An applied operation is announced politely: undo and redo change protocol
 * state without a reload, and can move the researcher to another page to show
 * the result, neither of which a screen reader would otherwise report. The
 * announcement is skipped when the timeline refused the operation, so it can
 * never claim a change that did not happen.
 */
export const useProtocolUndoRedo = (): ProtocolUndoRedo => {
  const intl = useAppIntl();
  const dispatch = useAppDispatch();
  const { announce } = useAccessibilityAnnouncements();

  const canUndo = useAppSelector(getCanUndo);
  const canRedo = useAppSelector(getCanRedo);

  const undo = useCallback(() => {
    const outcome = dispatch(undoWithNavigation());
    if (!outcome.applied) return;
    announce(undoAnnouncement(outcome.navigatedTo, intl));
  }, [announce, dispatch, intl]);

  const redo = useCallback(() => {
    const outcome = dispatch(redoWithNavigation());
    if (!outcome.applied) return;
    announce(redoAnnouncement(outcome.navigatedTo, intl));
  }, [announce, dispatch, intl]);

  return useMemo(
    () => ({ canUndo, canRedo, undo, redo }),
    [canRedo, canUndo, redo, undo],
  );
};
