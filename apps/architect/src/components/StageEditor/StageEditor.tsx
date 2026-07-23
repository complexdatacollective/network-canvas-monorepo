import { omit } from 'es-toolkit/compat';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { getFormValues, isInvalid } from 'redux-form';
import { useLocation } from 'wouter';

import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import {
  type Stage,
  type StageType,
  validateProtocol,
} from '@codaco/protocol-validation';
import Editor from '~/components/Editor';
import { launchPreview } from '~/components/PreviewHost/launchPreview';
import StageEditorNav from '~/components/ProjectNav/StageEditorNav';
import { useAppDispatch } from '~/ducks/hooks';
import {
  getPreviewIgnoreSkipLogic,
  getPreviewUseSyntheticData,
  setPreviewIgnoreSkipLogic,
  setPreviewUseSyntheticData,
} from '~/ducks/modules/app';
import { actionCreators as stageActions } from '~/ducks/modules/protocol/stages';
import { resetDraft } from '~/ducks/modules/stageEditorDraft';
import type { RootState } from '~/ducks/store';
import { useStageEditorKeyboard } from '~/hooks/useStageEditorKeyboard';
import { getProtocol, getStage, getStageIndex } from '~/selectors/protocol';
import { getStageDraftDirty } from '~/selectors/stageEditorDraft';
import { markAutosavePending } from '~/utils/criticalOperation';
import { ensureError } from '~/utils/ensureError';
import { reportError } from '~/utils/reportError';

import {
  buildProtocolWithStage,
  normalizePreviewStage,
  shouldOverridePreviewStage,
} from './buildProtocolWithStage';
import { formName } from './configuration';
import type { SectionComponent } from './Interfaces';
import { getInterface } from './Interfaces';
import StageHeading from './StageHeading';

type StageEditorProps = {
  id?: string | null;
  insertAtIndex?: number;
  type?: string;
};

const StageEditor = (props: StageEditorProps) => {
  const { id = null, type, insertAtIndex } = props;

  const dispatch = useAppDispatch();
  const { openDialog } = useDialog();
  useStageEditorKeyboard();
  const [, setLocation] = useLocation();

  // Get stage metadata from Redux state
  const stage = useSelector((state: RootState) => getStage(state, id || ''));
  const stageIndex = useSelector((state: RootState) =>
    getStageIndex(state, id || ''),
  );
  const protocol = useSelector(getProtocol);

  // A non-'new' stage URL (id set) whose stage no longer exists in the loaded
  // protocol. `id` is null for the create-new flow, so this only catches stale
  // links to deleted/removed stages, not new-stage creation. Guarded on the
  // protocol being loaded so an in-flight load isn't mistaken for a missing
  // stage.
  const stageMissing = Boolean(protocol) && id !== null && stageIndex === -1;

  // Redirect stale stage URLs back to the stage list rather than rendering a
  // fake 'Information' editor whose Save would silently discard the user's edits
  // against a stage that no longer exists.
  useEffect(() => {
    if (!stageMissing) {
      return;
    }
    void openDialog({
      type: 'acknowledge',
      intent: 'info',
      title: 'Stage not found',
      description:
        'That stage no longer exists. It may have been deleted. Returning you to the protocol overview.',
      actions: { primary: { label: 'OK', value: true } },
    });
    setLocation('/protocol');
  }, [stageMissing, openDialog, setLocation]);

  const stagePath = stageIndex !== -1 ? `stages[${stageIndex}]` : null;
  const interfaceType = (stage?.type || type || 'Information') as StageType;
  const template = getInterface(interfaceType).template;
  const initialValues = stage || { ...template, type: interfaceType };

  // Get form state
  const hasUnsavedChanges = useSelector(getStageDraftDirty);
  const formValues = useSelector((state: RootState) =>
    getFormValues(formName)(state),
  ) as Stage | undefined;
  const isFormSyncInvalid = useSelector((state: RootState) =>
    isInvalid(formName)(state),
  );

  // Preview state
  const [isOpeningPreview, setIsOpeningPreview] = useState(false);
  const useSyntheticData = useSelector(getPreviewUseSyntheticData);
  const ignoreSkipLogic = useSelector(getPreviewIgnoreSkipLogic);

  // Whether the wip protocol (committed protocol + current stage edits) passes
  // full schema validation. We disable preview whenever it does not, so the
  // button reflects "this would be a valid protocol to preview" rather than
  // only redux-form's field-level (mount-dependent) sync state. This covers
  // structural problems the sync validators miss — e.g. a side panel with no
  // title (`title` pruned away -> required field missing) or with a malformed
  // filter — even when the relevant section is collapsed and its fields are
  // unmounted. Starts `false` (disabled until proven valid) so preview can't be
  // clicked before the first validation resolves; the first run is immediate
  // (see below) so a freshly-opened valid stage doesn't visibly sit disabled.
  const [isWipProtocolValid, setIsWipProtocolValid] = useState(false);
  const hasValidatedOnce = useRef(false);

  // The draft baseline is seeded by the stageEditorDraft listener on
  // redux-form INITIALIZE (which fires on mount and on `id` change via
  // enableReinitialize), so no mount effect is needed here.
  useEffect(() => {
    if (!protocol || !formValues) {
      setIsWipProtocolValid(false);
      return;
    }

    let cancelled = false;
    // Validate the exact stage shape preview will launch so the disabled state
    // can't disagree with what clicking Preview would actually do. The initial
    // one-stage override is runtime-only; skip logic remains in this shape.
    const runValidation = () => {
      const stageToValidate = normalizePreviewStage(formValues);
      const wipProtocol = buildProtocolWithStage(
        protocol,
        stageToValidate,
        id,
        insertAtIndex,
      );
      void validateProtocol(wipProtocol)
        .then((result) => {
          if (!cancelled) {
            hasValidatedOnce.current = true;
            setIsWipProtocolValid(result.success);
          }
        })
        .catch(() => {
          if (!cancelled) {
            hasValidatedOnce.current = true;
            setIsWipProtocolValid(false);
          }
        });
    };

    // Run the first validation immediately so the button settles promptly on
    // open; debounce subsequent edits so we don't validate on every keystroke.
    if (!hasValidatedOnce.current) {
      runValidation();
      return () => {
        cancelled = true;
      };
    }

    const handle = setTimeout(runValidation, 200);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [protocol, formValues, id, insertAtIndex]);

  // Preview is disabled when the form has obvious field-level errors (immediate
  // feedback) or when the wip protocol fails schema validation (comprehensive,
  // and independent of which sections are currently mounted).
  const isStageInvalid = isFormSyncInvalid || !isWipProtocolValid;

  // Handle form submission
  const onSubmit = useCallback(
    (stageData: Record<string, unknown>) => {
      const normalizedStage = omit(stageData, '_modified') as Stage;

      if (id) {
        dispatch(stageActions.updateStage(id, normalizedStage));
      } else {
        dispatch(
          stageActions.createStage({
            options: normalizedStage,
            index: insertAtIndex,
          }),
        );
      }

      // resetDraft clears the draft-dirty guard immediately, but the committed
      // edit is only persisted after the autosave debounce + write. Flag that
      // window so an update reload defers until the write lands.
      markAutosavePending();
      dispatch(resetDraft(null));
      setLocation('/protocol');
    },
    [id, insertAtIndex, setLocation, dispatch],
  );

  // Cancel handler with unsaved changes confirmation
  const handleCancel = useCallback(async (): Promise<boolean> => {
    if (!hasUnsavedChanges) {
      dispatch(resetDraft(null));
      setLocation('/protocol');
      return true;
    }

    const confirmed = await openDialog({
      type: 'choice',
      intent: 'warning',
      title: 'Unsaved Changes',
      description:
        'You have unsaved changes. Are you sure you want to leave without saving?',
      actions: {
        primary: { label: 'Leave Without Saving', value: true },
        cancel: { label: 'Cancel', value: false },
      },
    });

    if (confirmed) {
      dispatch(resetDraft(null));
      setLocation('/protocol');
      return true;
    }

    return false;
  }, [hasUnsavedChanges, openDialog, setLocation, dispatch]);

  const handlePreview = useCallback(async () => {
    if (!protocol || !formValues) {
      void openDialog({
        type: 'acknowledge',
        intent: 'destructive',
        title: 'Preview Error',
        description: 'No protocol loaded',
        actions: { primary: { label: 'OK', value: true } },
      });
      return;
    }

    const normalizedStage = normalizePreviewStage(formValues);
    const previewProtocol = buildProtocolWithStage(
      protocol,
      normalizedStage,
      id,
      insertAtIndex,
    );

    const validationResult = await validateProtocol(previewProtocol);
    if (!validationResult.success) {
      void openDialog({
        type: 'acknowledge',
        intent: 'destructive',
        title: 'Cannot Preview',
        description: ensureError(validationResult.error).message,
        actions: { primary: { label: 'OK', value: true } },
      });
      return;
    }

    // Clamp to a valid index into the preview protocol (which includes the wip
    // stage for the create-new flow) so a missing/out-of-range position can't
    // launch preview one past the end.
    const desiredStartStage =
      stageIndex !== -1
        ? stageIndex
        : (insertAtIndex ?? previewProtocol.stages.length - 1);
    const startStage = Math.min(
      Math.max(desiredStartStage, 0),
      previewProtocol.stages.length - 1,
    );
    const skipLogicBypassed = shouldOverridePreviewStage(
      previewProtocol,
      startStage,
      ignoreSkipLogic,
    );
    setIsOpeningPreview(true);
    try {
      const result = await launchPreview({
        protocol: previewProtocol,
        startStage,
        useSyntheticData,
        skipLogicBypassed,
      });
      if (result.kind === 'popup-blocked') {
        void openDialog({
          type: 'acknowledge',
          intent: 'info',
          title: 'Preview popup blocked',
          description:
            'Your browser blocked the preview popup. Allow popups for this site, then click Preview again.',
          actions: { primary: { label: 'OK', value: true } },
        });
      }
    } catch (error) {
      reportError(error);
      void openDialog({
        type: 'acknowledge',
        intent: 'destructive',
        title: 'Preview Failed',
        description:
          error instanceof Error ? error.message : 'Failed to open preview',
        actions: { primary: { label: 'OK', value: true } },
      });
    } finally {
      setIsOpeningPreview(false);
    }
  }, [
    protocol,
    stageIndex,
    dispatch,
    openDialog,
    formValues,
    id,
    insertAtIndex,
    useSyntheticData,
    ignoreSkipLogic,
  ]);
  const sections = useMemo(
    () => getInterface(interfaceType).sections,
    [interfaceType],
  );

  const isExistingStage = stageIndex !== -1;
  const protocolStageCount = protocol?.stages.length ?? 0;
  const stagePosition = isExistingStage
    ? stageIndex
    : (insertAtIndex ?? protocolStageCount);

  const renderSections = (sectionsList: readonly SectionComponent[]) =>
    sectionsList.map(
      (SectionComponent: SectionComponent, sectionIndex: number) => {
        const sectionKey = `${interfaceType}-${sectionIndex}`;
        return (
          <SectionComponent
            key={sectionKey}
            form={formName}
            stagePath={stagePath}
            stagePosition={stagePosition}
            interfaceType={interfaceType}
          />
        );
      },
    );

  const stageName =
    (formValues?.label as string | undefined) ?? stage?.label ?? 'New stage';
  const stageNumber = stagePosition + 1;
  const totalStages = protocolStageCount + (isExistingStage ? 0 : 1);
  const previewLabel = isOpeningPreview ? 'Opening preview…' : 'Preview';

  const previewOptionsContent = (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-3">
        <ToggleField
          value={useSyntheticData}
          onChange={(checked) =>
            dispatch(setPreviewUseSyntheticData(!!checked))
          }
        />
        <span className="text-sm">Start preview with example data</span>
      </label>
      <label className="flex items-center gap-3">
        <ToggleField
          value={ignoreSkipLogic}
          onChange={(checked) => dispatch(setPreviewIgnoreSkipLogic(!!checked))}
        />
        <span className="text-sm">
          Always show this stage in preview when skip logic would otherwise make
          it unavailable
        </span>
      </label>
    </div>
  );

  // While the stale-URL redirect effect runs, render nothing rather than the
  // fake 'Information' editor.
  if (stageMissing) {
    return null;
  }

  return (
    <Editor initialValues={initialValues} onSubmit={onSubmit} form={formName}>
      <div className="relative h-full overflow-y-auto pb-32">
        <StageEditorNav
          stageName={stageName}
          onCancel={handleCancel}
          onPreview={handlePreview}
          previewLabel={previewLabel}
          previewOptionsContent={previewOptionsContent}
          isStageInvalid={isStageInvalid}
          isOpeningPreview={isOpeningPreview}
          hasUnsavedChanges={hasUnsavedChanges}
        />
        <div className="phone-landscape:px-6 px-4">
          <div className="mx-auto w-full max-w-7xl">
            <StageHeading
              stageNumber={stageNumber}
              totalStages={totalStages}
              isNewStage={!isExistingStage}
            />
            <div className="flex flex-col gap-10 pt-14">
              {renderSections(sections)}
            </div>
          </div>
        </div>
      </div>
    </Editor>
  );
};

export default StageEditor;
