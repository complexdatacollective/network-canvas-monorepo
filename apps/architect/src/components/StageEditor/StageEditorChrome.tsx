import { createElement, useCallback, useEffect, useId, useState } from 'react';
import { useSelector } from 'react-redux';

import { defineMessages } from '@codaco/app-i18n/messages';
import {
  AppErrorMessage,
  AppMessage,
  useAppIntl,
} from '@codaco/app-i18n/react';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import { useStageEditorForm } from '@codaco/protocol-builder/form/stageEditorContext';
import { stageDocument } from '@codaco/protocol-builder/stageDocument';
import { useStageEdit } from '@codaco/protocol-builder/stageEdit';
import { type Stage, validateProtocol } from '@codaco/protocol-validation';
import { ensureError } from '@codaco/shared-consts';
import { launchPreview } from '~/components/PreviewHost/launchPreview';
import { StageEditorToolbar } from '~/components/ProjectNav/StageEditorNav';
import { useAppDispatch } from '~/ducks/hooks';
import {
  getPreviewRespectSkipLogic,
  getPreviewUseSyntheticData,
  setPreviewRespectSkipLogic,
  setPreviewUseSyntheticData,
} from '~/ducks/modules/app';
import { useSingleFlight } from '~/hooks/useSingleFlight';
import { toSubmissionError } from '~/i18n/submissionErrors';
import { getProtocol } from '~/selectors/protocol';
import { reportError } from '~/utils/reportError';

import { buildProtocolWithStage } from './buildProtocolWithStage';
import {
  closeStageDraft,
  publishStageDraft,
  readStageDraft,
  useStageDraft,
} from './stageDraftBeacon';
const messages = defineMessages({
  openingPreview: {
    id: 'architect.chrome.stageEditor.stageEditor.openingPreview',
    defaultMessage: 'Opening preview…',
    description:
      'Researcher-facing explanatory text in components / StageEditor / StageEditor.',
  },
  preview: {
    id: 'architect.chrome.stageEditor.stageEditor.preview',
    defaultMessage: 'Preview',
    description:
      'Researcher-facing explanatory text in components / StageEditor / StageEditor.',
  },
  oK: {
    id: 'architect.stageEditor.stageEditorChrome.oK',
    defaultMessage: 'OK',
    description:
      'The label that dismisses a preview dialog in components / StageEditor / StageEditorChrome.',
  },
  previewError: {
    id: 'architect.stageEditor.stageEditor.previewError',
    defaultMessage: 'Preview Error',
    description: 'The title text in components / StageEditor / StageEditor.',
  },
  noProtocolLoaded: {
    id: 'architect.stageEditor.stageEditor.noProtocolLoaded',
    defaultMessage: 'No protocol loaded',
    description:
      'The description text in components / StageEditor / StageEditor.',
  },
  cannotPreview: {
    id: 'architect.stageEditor.stageEditor.cannotPreview',
    defaultMessage: 'Cannot Preview',
    description: 'The title text in components / StageEditor / StageEditor.',
  },
  previewPopupBlocked: {
    id: 'architect.stageEditor.stageEditor.previewPopupBlocked',
    defaultMessage: 'Preview popup blocked',
    description: 'The title text in components / StageEditor / StageEditor.',
  },
  yourBrowserBlockedThePreviewPopup: {
    id: 'architect.stageEditor.stageEditor.yourBrowserBlockedThePreviewPopup',
    defaultMessage:
      'Your browser blocked the preview popup. Allow popups for this site, then click Preview again.',
    description:
      'The description text in components / StageEditor / StageEditor.',
  },
  previewFailed: {
    id: 'architect.stageEditor.stageEditor.previewFailed',
    defaultMessage: 'Preview Failed',
    description: 'The title text in components / StageEditor / StageEditor.',
  },
  failedToOpenPreview: {
    id: 'architect.stageEditor.stageEditor.failedToOpenPreview',
    defaultMessage: 'Failed to open preview',
    description:
      'The description text in components / StageEditor / StageEditor.',
  },
  startPreviewWithExampleData: {
    id: 'architect.stageEditor.stageEditor.startPreviewWithExampleData',
    defaultMessage: 'Start preview with example data',
    description: 'Visible text in components / StageEditor / StageEditor.',
  },
  respectSkipLogic: {
    id: 'architect.stageEditor.stageEditor.respectSkipLogic',
    defaultMessage: 'Respect skip logic',
    description: 'Visible text in components / StageEditor / StageEditor.',
  },
});

type StageEditorChromeProps = Readonly<{
  /** The DOM id of the stage form, so the toolbar's save control can submit it. */
  formId: string;
  /** Whether the package opened this stage read-only. */
  readOnly: boolean;
  /** The stage being edited, or `null` while one is being created. */
  stageId: string | null;
  /** Where a stage being created will land in the stage order. */
  insertAtIndex?: number;
  onCancel: () => void;
}>;

/**
 * Architect's own chrome, rendered in the editor's action slot.
 *
 * The slot is called inside the stage form's provider, which is what lets this
 * read the document as the researcher is typing it: the toolbar's save control
 * belongs to that form, the preview launches what is on screen rather than what
 * was last saved, and the beacon publishes the same reading to the guards
 * outside. Everything it renders is registered elsewhere — the toolbar into the
 * app's own toolbar host — so nothing here occupies the place in the page where
 * the slot happens to sit.
 */
export default function StageEditorChrome({
  formId,
  readOnly,
  stageId,
  insertAtIndex,
  onCancel,
}: StageEditorChromeProps) {
  return (
    <>
      <StageDraftPublisher />
      <StageEditorActions
        formId={formId}
        readOnly={readOnly}
        stageId={stageId}
        {...(insertAtIndex === undefined ? {} : { insertAtIndex })}
        onCancel={onCancel}
      />
    </>
  );
}

/**
 * Publishes the stage as the form holds it, on every change to that form.
 *
 * Subscribed to the form's own store rather than rendered from it: this
 * publishes for readers that are not components at all, and re-rendering the
 * editor's chrome on every keystroke to do it would be a re-render for
 * something nobody is looking at.
 */
function StageDraftPublisher() {
  const { liveDraft, storeApi, identity } = useStageEditorForm();
  const { committedFields } = useStageEdit();

  useEffect(() => {
    if (committedFields === undefined) return;
    const publish = () => {
      const draft = liveDraft();
      publishStageDraft(
        stageDocument(identity, draft) as unknown as Stage,
        committedFields,
        draft,
      );
    };
    publish();
    const unsubscribe = storeApi.subscribe(publish);
    return () => {
      unsubscribe();
      closeStageDraft();
    };
  }, [committedFields, identity, liveDraft, storeApi]);

  return null;
}

function StageEditorActions({
  formId,
  readOnly,
  stageId,
  insertAtIndex,
  onCancel,
}: StageEditorChromeProps) {
  const intl = useAppIntl();
  const dispatch = useAppDispatch();
  const { openDialog } = useDialog();
  const protocol = useSelector(getProtocol);
  const useSyntheticData = useSelector(getPreviewUseSyntheticData);
  const respectSkipLogic = useSelector(getPreviewRespectSkipLogic);

  const [isOpeningPreview, setIsOpeningPreview] = useState(false);
  // Disabled until the stage is known to be previewable, so Preview cannot be
  // clicked before the first reading has resolved.
  const [isStageValid, setIsStageValid] = useState(false);

  const stagePreviewProtocol = useCallback(() => {
    const stage = readStageDraft().stage;
    if (protocol === null || stage === undefined) return undefined;
    return buildProtocolWithStage(protocol, stage, stageId, insertAtIndex);
  }, [insertAtIndex, protocol, stageId]);

  /**
   * Guarded by a latch of its own rather than by the button's `disabled` — two
   * clicks in one tick would validate the protocol twice and open two windows.
   */
  const runPreview = useCallback(async () => {
    const previewProtocol = stagePreviewProtocol();
    if (previewProtocol === undefined) {
      void openDialog({
        type: 'acknowledge',
        intent: 'destructive',
        title: createElement(AppMessage, { message: messages.previewError }),
        description: createElement(AppMessage, {
          message: messages.noProtocolLoaded,
        }),
        actions: {
          primary: {
            label: createElement(AppMessage, { message: messages.oK }),
            value: true,
          },
        },
      });
      return;
    }

    const validationResult = await validateProtocol(previewProtocol);
    if (!validationResult.success) {
      void openDialog({
        type: 'acknowledge',
        intent: 'destructive',
        title: createElement(AppMessage, { message: messages.cannotPreview }),
        description: ensureError(validationResult.error).message,
        actions: {
          primary: {
            label: createElement(AppMessage, { message: messages.oK }),
            value: true,
          },
        },
      });
      return;
    }

    // Clamped to a stage the preview protocol actually has: a stage being
    // created is inserted at its own position, and a missing or out-of-range
    // one would start the preview one past the end.
    const stageId_ = readStageDraft().stage?.id;
    const index = previewProtocol.stages.findIndex(
      (stage) => stage.id === stageId_,
    );
    const startStage = Math.min(
      Math.max(index === -1 ? (insertAtIndex ?? 0) : index, 0),
      previewProtocol.stages.length - 1,
    );

    setIsOpeningPreview(true);
    try {
      const result = await launchPreview({
        protocol: previewProtocol,
        startStage,
        useSyntheticData,
        respectSkipLogic,
      });
      if (result.kind === 'popup-blocked') {
        void openDialog({
          type: 'acknowledge',
          intent: 'info',
          title: createElement(AppMessage, {
            message: messages.previewPopupBlocked,
          }),
          description: createElement(AppMessage, {
            message: messages.yourBrowserBlockedThePreviewPopup,
          }),
          actions: {
            primary: {
              label: createElement(AppMessage, { message: messages.oK }),
              value: true,
            },
          },
        });
      }
    } catch (error) {
      reportError(error);
      void openDialog({
        type: 'acknowledge',
        intent: 'destructive',
        title: createElement(AppMessage, { message: messages.previewFailed }),
        description: createElement(AppErrorMessage, {
          error: toSubmissionError(error, messages.failedToOpenPreview),
        }),
        actions: {
          primary: {
            label: createElement(AppMessage, { message: messages.oK }),
            value: true,
          },
        },
      });
    } finally {
      setIsOpeningPreview(false);
    }
  }, [
    insertAtIndex,
    openDialog,
    respectSkipLogic,
    stagePreviewProtocol,
    useSyntheticData,
  ]);
  const handlePreview = useSingleFlight(runPreview);

  const previewOptionsContent = (
    <PreviewOptions
      useSyntheticData={useSyntheticData}
      respectSkipLogic={respectSkipLogic}
      onUseSyntheticData={(next) => dispatch(setPreviewUseSyntheticData(next))}
      onRespectSkipLogic={(next) => dispatch(setPreviewRespectSkipLogic(next))}
    />
  );

  return (
    <>
      <PreviewValidity
        buildProtocol={stagePreviewProtocol}
        onSettled={setIsStageValid}
      />
      <StageEditorToolbar
        formId={formId}
        readOnly={readOnly}
        onCancel={onCancel}
        onPreview={handlePreview}
        previewLabel={
          isOpeningPreview
            ? intl.formatMessage(messages.openingPreview)
            : intl.formatMessage(messages.preview)
        }
        previewOptionsContent={previewOptionsContent}
        isStageInvalid={!isStageValid}
        isOpeningPreview={isOpeningPreview}
      />
    </>
  );
}

/**
 * Whether the stage on screen is one the preview could actually run.
 *
 * The whole protocol is validated rather than the form's own `isValid`, which
 * is a strict subset: a side panel with no title, or a malformed filter, is a
 * protocol the preview cannot open even while every mounted control is
 * satisfied — and the form's answer is populated lazily by whichever fields
 * happen to have validated, which would make the button's state depend on
 * where the researcher had clicked.
 *
 * A component of its own so that following the draft — which changes on every
 * keystroke — re-renders this and not the chrome around it.
 */
function PreviewValidity({
  buildProtocol,
  onSettled,
}: Readonly<{
  buildProtocol: () => ReturnType<typeof buildProtocolWithStage> | undefined;
  onSettled: (valid: boolean) => void;
}>) {
  const stage = useStageDraft((beacon) => beacon.stage);

  useEffect(() => {
    if (stage === undefined) {
      onSettled(false);
      return;
    }
    let cancelled = false;
    // Debounced, so a protocol is not validated on every keystroke; the button
    // settles a moment after the researcher stops typing.
    const handle = setTimeout(() => {
      const wip = buildProtocol();
      if (wip === undefined) {
        if (!cancelled) onSettled(false);
        return;
      }
      void validateProtocol(wip)
        .then((result) => {
          if (!cancelled) onSettled(result.success);
        })
        .catch(() => {
          if (!cancelled) onSettled(false);
        });
    }, VALIDATION_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [buildProtocol, onSettled, stage]);

  return null;
}

/** Long enough that typing does not validate the protocol per keystroke. */
const VALIDATION_DEBOUNCE_MS = 200;

function PreviewOptions({
  useSyntheticData,
  respectSkipLogic,
  onUseSyntheticData,
  onRespectSkipLogic,
}: Readonly<{
  useSyntheticData: boolean;
  respectSkipLogic: boolean;
  onUseSyntheticData: (next: boolean) => void;
  onRespectSkipLogic: (next: boolean) => void;
}>) {
  const intl = useAppIntl();

  // A `<label>` cannot name either of these: `ToggleField` renders a bare
  // `<button role="switch">`, and a button's accessible name never comes from
  // an associated label the way an `<input>`'s does. Each is pointed at its own
  // text explicitly instead.
  return (
    <div className="flex flex-col gap-3">
      <ToggleOption
        label={intl.formatMessage(messages.startPreviewWithExampleData)}
        value={useSyntheticData}
        onChange={onUseSyntheticData}
      />
      <ToggleOption
        label={intl.formatMessage(messages.respectSkipLogic)}
        value={respectSkipLogic}
        onChange={onRespectSkipLogic}
      />
    </div>
  );
}

function ToggleOption({
  label,
  value,
  onChange,
}: Readonly<{
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
}>) {
  const labelId = useId();

  return (
    <div className="flex items-center gap-3">
      <ToggleField
        aria-labelledby={labelId}
        value={value}
        onChange={(checked) => onChange(!!checked)}
      />
      <span id={labelId} className="text-sm">
        {label}
      </span>
    </div>
  );
}
