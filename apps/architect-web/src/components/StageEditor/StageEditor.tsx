import { omit } from 'es-toolkit/compat';
import { Settings } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { getFormValues, isInvalid } from 'redux-form';
import { useLocation } from 'wouter';

import {
  type Stage,
  type StageType,
  validateProtocol,
} from '@codaco/protocol-validation';
import Editor from '~/components/Editor';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '~/components/NewComponents/Popover';
import Switch from '~/components/NewComponents/Switch';
import { launchPreview } from '~/components/PreviewHost/launchPreview';
import StageEditorNav from '~/components/ProjectNav/StageEditorNav';
import { useAppDispatch } from '~/ducks/hooks';
import {
  getPreviewIgnoreSkipLogic,
  getPreviewUseSyntheticData,
  setPreviewIgnoreSkipLogic,
  setPreviewUseSyntheticData,
} from '~/ducks/modules/app';
import { actionCreators as dialogActions } from '~/ducks/modules/dialogs';
import { actionCreators as stageActions } from '~/ducks/modules/protocol/stages';
import { resetDraft } from '~/ducks/modules/stageEditorDraft';
import type { RootState } from '~/ducks/store';
import { useStageEditorKeyboard } from '~/hooks/useStageEditorKeyboard';
import { IconButton } from '~/lib/legacy-ui/components/Button';
import { getProtocol, getStage, getStageIndex } from '~/selectors/protocol';
import { getStageDraftDirty } from '~/selectors/stageEditorDraft';
import { ensureError } from '~/utils/ensureError';
import { reportError } from '~/utils/reportError';

import {
  buildProtocolWithStage,
  normalizePreviewStage,
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
  useStageEditorKeyboard();
  const [, setLocation] = useLocation();

  // Get stage metadata from Redux state
  const stage = useSelector((state: RootState) => getStage(state, id || ''));
  const stageIndex = useSelector((state: RootState) =>
    getStageIndex(state, id || ''),
  );
  const protocol = useSelector(getProtocol);
  const stagePath = stageIndex !== -1 ? `stages[${stageIndex}]` : null;
  const interfaceType = (stage?.type || type || 'Information') as StageType;
  const template = getInterface(interfaceType).template || {};
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
    // Validate the exact stage shape preview will launch (same skip-logic
    // handling) so the disabled state can't disagree with what clicking Preview
    // would actually do.
    const runValidation = () => {
      const { stage: stageToValidate } = normalizePreviewStage(
        formValues,
        ignoreSkipLogic,
      );
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
  }, [protocol, formValues, id, insertAtIndex, ignoreSkipLogic]);

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

      dispatch(resetDraft(null));
      setLocation('/protocol');
    },
    [id, insertAtIndex, setLocation, dispatch],
  );

  // Cancel handler with unsaved changes confirmation
  const handleCancel = useCallback((): boolean => {
    if (!hasUnsavedChanges) {
      dispatch(resetDraft(null));
      setLocation('/protocol');
      return true;
    }

    // Show confirmation dialog for unsaved changes
    dispatch(
      dialogActions.openDialog({
        type: 'Warning',
        title: 'Unsaved Changes',
        message:
          'You have unsaved changes. Are you sure you want to leave without saving?',
        confirmLabel: 'Leave Without Saving',
        onConfirm: () => {
          dispatch(resetDraft(null));
          setLocation('/protocol');
        },
      }),
    );
    return false;
  }, [hasUnsavedChanges, setLocation, dispatch]);

  const handlePreview = useCallback(async () => {
    if (!protocol || !formValues) {
      dispatch(
        dialogActions.openDialog({
          type: 'Error',
          title: 'Preview Error',
          message: 'No protocol loaded',
        }),
      );
      return;
    }

    const { stage: normalizedStage, skipLogicBypassed } = normalizePreviewStage(
      formValues,
      ignoreSkipLogic,
    );
    const previewProtocol = buildProtocolWithStage(
      protocol,
      normalizedStage,
      id,
      insertAtIndex,
    );

    const validationResult = await validateProtocol(previewProtocol);
    if (!validationResult.success) {
      dispatch(
        dialogActions.openDialog({
          type: 'Error',
          title: 'Cannot Preview',
          message: ensureError(validationResult.error).message,
        }),
      );
      return;
    }

    const startStage =
      stageIndex !== -1
        ? stageIndex
        : (insertAtIndex ?? protocol.stages.length);
    setIsOpeningPreview(true);
    try {
      const result = await launchPreview({
        protocol: previewProtocol,
        startStage,
        useSyntheticData,
        skipLogicBypassed,
      });
      if (result.kind === 'popup-blocked') {
        dispatch(
          dialogActions.openDialog({
            type: 'Notice',
            title: 'Preview popup blocked',
            message:
              'Your browser blocked the preview popup. Allow popups for this site, then click Preview again.',
          }),
        );
      }
    } catch (error) {
      reportError(error);
      dispatch(
        dialogActions.openDialog({
          type: 'Error',
          title: 'Preview Failed',
          message:
            error instanceof Error ? error.message : 'Failed to open preview',
        }),
      );
    } finally {
      setIsOpeningPreview(false);
    }
  }, [
    protocol,
    stageIndex,
    dispatch,
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

  const renderSections = (sectionsList: readonly SectionComponent[]) =>
    sectionsList.map(
      (SectionComponent: SectionComponent, sectionIndex: number) => {
        const sectionKey = `${interfaceType}-${sectionIndex}`;
        return (
          <SectionComponent
            key={sectionKey}
            form={formName}
            stagePath={stagePath}
            interfaceType={interfaceType}
          />
        );
      },
    );

  const stageName =
    (formValues?.label as string | undefined) ?? stage?.label ?? 'New stage';
  const isExistingStage = stageIndex !== -1;
  const protocolStageCount = protocol?.stages.length ?? 0;
  const stagePosition = isExistingStage
    ? stageIndex
    : (insertAtIndex ?? protocolStageCount);
  const stageNumber = stagePosition + 1;
  const totalStages = protocolStageCount + (isExistingStage ? 0 : 1);
  const previewLabel = isOpeningPreview ? 'Opening preview…' : 'Preview';

  const previewOptions = (
    <Popover>
      <PopoverTrigger asChild>
        <IconButton
          variant="text"
          icon={<Settings />}
          aria-label="Preview options"
        />
      </PopoverTrigger>
      <PopoverContent
        side="top"
        sideOffset={8}
        className="bg-surface-accent text-surface-accent-foreground p-3"
      >
        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-3">
            <Switch
              checked={useSyntheticData}
              onCheckedChange={(checked) =>
                dispatch(setPreviewUseSyntheticData(checked))
              }
            />
            <span className="text-sm">Start preview with example data</span>
          </label>
          <label className="flex items-center gap-3">
            <Switch
              checked={ignoreSkipLogic}
              onCheckedChange={(checked) =>
                dispatch(setPreviewIgnoreSkipLogic(checked))
              }
            />
            <span className="text-sm">
              Always show this stage in preview when skip logic would hide it
            </span>
          </label>
        </div>
      </PopoverContent>
    </Popover>
  );

  return (
    <Editor initialValues={initialValues} onSubmit={onSubmit} form={formName}>
      <div className="relative h-dvh overflow-y-auto pb-32">
        <StageEditorNav
          stageName={stageName}
          onCancel={handleCancel}
          onPreview={handlePreview}
          previewLabel={previewLabel}
          previewOptions={previewOptions}
          isStageInvalid={isStageInvalid}
          isOpeningPreview={isOpeningPreview}
          hasUnsavedChanges={hasUnsavedChanges}
        />
        <div className="px-4 sm:px-6">
          <div className="mx-auto w-full max-w-7xl">
            <StageHeading stageNumber={stageNumber} totalStages={totalStages} />
            <div className="flex flex-col gap-10 pt-(--space-2xl)">
              {renderSections(sections)}
            </div>
          </div>
        </div>
      </div>
    </Editor>
  );
};

export default StageEditor;
