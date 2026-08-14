import { omit } from 'es-toolkit/compat';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSelector, useStore } from 'react-redux';
import { useLocation } from 'wouter';

import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import type { FieldValue } from '@codaco/fresco-ui/form/Field/types';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import type { FormSubmitHandler } from '@codaco/fresco-ui/form/store/types';
import {
  type Stage,
  type StageType,
  validateProtocol,
} from '@codaco/protocol-validation';
import { launchPreview } from '~/components/PreviewHost/launchPreview';
import StageEditorNav from '~/components/ProjectNav/StageEditorNav';
import { useAppDispatch } from '~/ducks/hooks';
import {
  getPreviewRespectSkipLogic,
  getPreviewUseSyntheticData,
  getProtocolLockState,
  setPreviewRespectSkipLogic,
  setPreviewUseSyntheticData,
} from '~/ducks/modules/app';
import {
  commitStageEditorDraftThunk,
  resetDraft,
} from '~/ducks/modules/stageEditorDraft';
import type { RootState } from '~/ducks/store';
import {
  getLeavePersistence,
  guardState,
  stageDiscardDescriptions,
} from '~/hooks/useProtocolNavGuard';
import { useStageEditorKeyboard } from '~/hooks/useStageEditorKeyboard';
import { getProtocol, getStage, getStageIndex } from '~/selectors/protocol';
import {
  getLiveStageDraftDirty,
  getLiveStageValues,
} from '~/selectors/stageEditorDraft';
import { ensureError } from '~/utils/ensureError';
import { refusedCommitMessage } from '~/utils/protocolLockMessages';
import { reportError } from '~/utils/reportError';

import { buildProtocolWithStage } from './buildProtocolWithStage';
import { getStageEditorInitialValues } from './getStageEditorInitialValues';
import type { SectionComponent } from './Interfaces';
import { getInterface, interfaceHasSkipLogicSection } from './Interfaces';
import StageDraftConflictDialog from './StageDraftConflictDialog';
import StageForm from './StageForm';
import { flushStageLiveValues } from './StageFormBridge';
import StageHeading from './StageHeading';

type StageEditorProps = {
  id?: string | null;
  insertAtIndex?: number;
  type?: string;
};

/**
 * Undo/redo shortcuts write to the stage form store, so the hook has to run
 * inside the form's provider.
 */
const StageEditorKeyboardShortcuts = () => {
  useStageEditorKeyboard();
  return null;
};

const StageEditor = (props: StageEditorProps) => {
  const { id = null, type, insertAtIndex } = props;

  const dispatch = useAppDispatch();
  const reduxStore = useStore<RootState>();
  const { openDialog } = useDialog();
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
    // Abandons the draft along with the stage. Without this the editor's
    // codebook transaction would stay open after the redirect, and codebook
    // writes made elsewhere would land on a draft nothing will ever commit.
    dispatch(resetDraft(null));
    setLocation('/protocol');
  }, [stageMissing, openDialog, setLocation, dispatch]);

  const stagePath = stageIndex !== -1 ? `stages[${stageIndex}]` : null;
  const interfaceType = (stage?.type || type || 'Information') as StageType;
  const template = getInterface(interfaceType).template;

  // The committed stage seeds the draft baseline and every field's
  // `initialValue`, both of which are register-effect dependencies — so it has
  // to keep its identity across renders.
  const committedStage = useMemo(
    () =>
      getStageEditorInitialValues({
        interfaceType,
        stage,
        template,
      }) as unknown as Stage,
    [interfaceType, stage, template],
  );

  const hasUnsavedChanges = useSelector(getLiveStageDraftDirty);
  const formValues = useSelector(getLiveStageValues);

  // Whether this interface renders the SkipLogic section. When it does not
  // (Anonymisation), no field can ever register under `skipLogic.*`, so a
  // committed `skipLogic` key — schema-valid on every stage and honored by the
  // interview runtime — could never survive a trip through the form.
  const stageFormCarriesSkipLogic = interfaceHasSkipLogicSection(interfaceType);

  /**
   * The stage's `id` and `type` belong to no field, so neither survives a trip
   * through the form. Every consumer of the form's values has to merge them
   * back: without `type` the stage matches no member of the schema's tagged
   * union, and the whole protocol fails validation.
   */
  const withStageIdentity = useCallback(
    (values: Stage): Stage =>
      ({
        id: committedStage.id,
        type: committedStage.type,
        // No field owns either key, so `values` cannot carry them — dropping
        // them keeps that explicit, and keeps the committed identity
        // authoritative if a future field ever does register one.
        ...omit(values as unknown as Record<string, unknown>, ['id', 'type']),
        // Like the identity above, a committed `skipLogic` on an interface
        // that renders no SkipLogic section structurally cannot be carried by
        // `values`; without this merge the overwrite save would silently
        // delete it on the first Finished Editing. Interfaces that DO render
        // the section are excluded on purpose: there an absent key means the
        // researcher toggled skip logic off, and restoring it would resurrect
        // exactly what they removed.
        ...(!stageFormCarriesSkipLogic && committedStage.skipLogic !== undefined
          ? { skipLogic: committedStage.skipLogic }
          : {}),
      }) as unknown as Stage,
    [committedStage, stageFormCarriesSkipLogic],
  );

  // Preview state
  const [isOpeningPreview, setIsOpeningPreview] = useState(false);
  const useSyntheticData = useSelector(getPreviewUseSyntheticData);
  const respectSkipLogic = useSelector(getPreviewRespectSkipLogic);

  // Whether the wip protocol (committed protocol + current stage edits) passes
  // full schema validation. We disable preview whenever it does not, so the
  // button reflects "this would be a valid protocol to preview". This is the
  // only gate: it covers structural problems field-level validators miss — e.g.
  // a side panel with no title (`title` pruned away -> required field missing)
  // or with a malformed filter — even when the relevant section is collapsed
  // and its fields are unmounted. (The form's own `isValid` is deliberately
  // not consulted: it is a strict subset of this check, and it is
  // populated lazily by whichever fields happen to have validated, which would
  // make the button's enabled state depend on where the researcher had
  // clicked.) Starts `false` (disabled until proven valid) so preview can't be
  // clicked before the first validation resolves; the first run is immediate
  // (see below) so a freshly-opened valid stage doesn't visibly sit disabled.
  const [isWipProtocolValid, setIsWipProtocolValid] = useState(false);
  const hasValidatedOnce = useRef(false);

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
      const wipProtocol = buildProtocolWithStage(
        protocol,
        withStageIdentity(formValues),
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
  }, [protocol, formValues, id, insertAtIndex, withStageIdentity]);

  const isStageInvalid = !isWipProtocolValid;

  const onSubmit = useCallback<FormSubmitHandler>(
    (values: Record<string, FieldValue>) => {
      // This tab does not own the saved copy of this protocol, so the library
      // write behind this commit would be dropped — and in `reclaim-blocked`
      // the commit would additionally replace the codebook wholesale from a
      // snapshot taken before the other tab's edits. Refuse rather than take it
      // into memory and look saved: the editor stays mounted holding the work,
      // and the banner above names the ways forward. (The commit button is
      // disabled too; this covers a submit raised from the keyboard, and says
      // why rather than failing silently.)
      const refusal = refusedCommitMessage(
        getProtocolLockState(reduxStore.getState()),
        'stage',
      );
      if (refusal) {
        return { success: false, formErrors: [refusal] };
      }

      // A key the form no longer carries has been removed (a section toggled
      // off), which is why the update overwrites rather than merges: preview
      // already renders the stage without it, and a merge would silently
      // resurrect it on save.
      const normalizedStage = withStageIdentity(values as unknown as Stage);

      // The stage and every codebook edit its field editors made are promoted
      // in one action, so the protocol timeline, validation and persistence
      // each see exactly one snapshot — and a half-applied save cannot exist.
      dispatch(commitStageEditorDraftThunk(id, normalizedStage, insertAtIndex));
      setLocation('/protocol');

      return { success: true };
    },
    [withStageIdentity, id, insertAtIndex, setLocation, dispatch, reduxStore],
  );

  // Cancel handler with unsaved changes confirmation
  const handleCancel = useCallback(async (): Promise<boolean> => {
    // The mirror is debounced, so an edit made in the last fraction of a
    // second may not have reached Redux. Reading a stale mirror here discards
    // that edit with no confirmation at all.
    flushStageLiveValues();

    if (!getLiveStageDraftDirty(reduxStore.getState())) {
      dispatch(resetDraft(null));
      setLocation('/protocol');
      return true;
    }

    // One decision, one prompt. Cancel and Back ask the researcher the very
    // same question about the very same draft — since the wording converged,
    // byte for byte — so Cancel joins the interlock the navigation guards
    // already share rather than being the one exit that can stack a second
    // identical dialog on top of the first.
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
        title: 'Discard unsaved stage changes?',
        description:
          stageDiscardDescriptions[
            persistence === 'no-protocol' ? 'saved' : persistence
          ],
        actions: {
          primary: { label: 'Discard Changes and Leave', value: true },
          cancel: { label: 'Cancel', value: false },
        },
      });

      if (confirmed) {
        dispatch(resetDraft(null));
        setLocation('/protocol');
        return true;
      }

      return false;
    } finally {
      guardState.prompting = false;
    }
  }, [openDialog, reduxStore, setLocation, dispatch]);

  // A browser-level exit (refresh, tab close, window close) is the one way out
  // of a dirty editor that no in-app guard can intercept, and the draft lives
  // only in memory — without this it is silently discarded while every in-app
  // exit prompts. The listener is attached for the editor's whole mount (not
  // gated on the debounced dirty selector): dirtiness is decided inside the
  // handler, after a synchronous mirror flush, so an edit made milliseconds
  // before unload still counts. Scoping the listener to the editor mount keeps
  // the rest of the app eligible for the back/forward cache, and it is kept
  // separate from `beforeUnloadGuard`, whose arm/disarm lifecycle belongs to
  // storage availability. Dialog-confirmed in-app discards dispatch
  // `resetDraft` before navigating, so this handler stays silent there.
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      // The mirror is debounced and the flush is synchronous, so the dirty
      // read below always sees the user's very last edit.
      flushStageLiveValues();
      if (!getLiveStageDraftDirty(reduxStore.getState())) {
        return;
      }
      // Setting returnValue triggers the browser's native "leave site?"
      // prompt; the string is legacy and ignored by modern browsers.
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [reduxStore]);

  const handlePreview = useCallback(async () => {
    // Preview must show the stage as it is on screen, not as the mirror last
    // coalesced it.
    flushStageLiveValues();
    const liveValues = getLiveStageValues(reduxStore.getState());

    if (!protocol || !liveValues) {
      void openDialog({
        type: 'acknowledge',
        intent: 'destructive',
        title: 'Preview Error',
        description: 'No protocol loaded',
        actions: { primary: { label: 'OK', value: true } },
      });
      return;
    }

    const previewProtocol = buildProtocolWithStage(
      protocol,
      withStageIdentity(liveValues),
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
    openDialog,
    reduxStore,
    withStageIdentity,
    id,
    insertAtIndex,
    useSyntheticData,
    respectSkipLogic,
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
          value={respectSkipLogic}
          onChange={(checked) =>
            dispatch(setPreviewRespectSkipLogic(!!checked))
          }
        />
        <span className="text-sm">Respect skip logic</span>
      </label>
    </div>
  );

  // While the stale-URL redirect effect runs, render nothing rather than the
  // fake 'Information' editor.
  if (stageMissing) {
    return null;
  }

  return (
    <StageForm
      stageId={id}
      interfaceType={interfaceType}
      committedStage={committedStage}
      onSubmit={onSubmit}
    >
      <StageEditorKeyboardShortcuts />
      <StageDraftConflictDialog
        stageId={id}
        insertAtIndex={insertAtIndex}
        withStageIdentity={withStageIdentity}
      />
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
    </StageForm>
  );
};

export default StageEditor;
