import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSelector } from 'react-redux';

import { computeAutoNameUpdate } from '@codaco/protocol-builder/naming/computeAutoNameUpdate';
import {
  generateStageLabel,
  STAGE_TYPE_NAMES,
} from '@codaco/protocol-builder/naming/generateStageLabel';
import {
  resolveStageQualifier,
  resolveStageSubjectName,
} from '@codaco/protocol-builder/naming/resolveStageNameParts';
import type {
  Item,
  Stage,
  StageSubject,
  StageType,
} from '@codaco/protocol-validation';
import { usePanelsForAutoName } from '~/components/sections/NodePanels/panelSlots';
import { useAppDispatch } from '~/ducks/hooks';
import { rebaselineDraftStage } from '~/ducks/modules/stageEditorDraft';
import {
  getAllVariablesByUUID,
  getEdgeTypes,
  getNodeTypes,
} from '~/selectors/codebook';
import {
  getAssetManifest,
  getCodebook,
  getStageList,
} from '~/selectors/protocol';

import { useStageRestoreVersion } from '../StageFormBridge';
import { useStageFormContext } from '../stageFormContext';
import { useSetStageValue, useStageFormValue } from '../stageFormHooks';

export function useAutoStageName(isNewStage: boolean): {
  onLabelBlur: () => void;
} {
  const dispatch = useAppDispatch();
  const { storeApi, draft } = useStageFormContext();
  const setStageValue = useSetStageValue();

  const type = useStageFormValue<StageType>('type');
  const label = useStageFormValue<string>('label');
  const subject = useStageFormValue<StageSubject>('subject');
  // Assembled from the per-index panel leaves, not read off the `panels`
  // container path — that path carries a dormant sentinel after a toggle-off
  // and would report "no panels" for the rest of the session (see
  // `usePanelsForAutoName`).
  const panels = usePanelsForAutoName();
  const items = useStageFormValue<Item[]>('items');
  const nominationPrompts =
    useStageFormValue<{ variable: string }[]>('nominationPrompts');

  const nodeTypes = useSelector(getNodeTypes);
  const edgeTypes = useSelector(getEdgeTypes);
  const codebook = useSelector(getCodebook);
  const assetManifest = useSelector(getAssetManifest);
  const stageList = useSelector(getStageList);

  const liveLabel = label ?? '';

  const generatedLabel = useMemo(() => {
    if (!type) {
      return '';
    }
    const variablesByUuid = codebook ? getAllVariablesByUUID(codebook) : {};
    const subjectName = resolveStageSubjectName(
      subject,
      (entity, entityType) => {
        const types = entity === 'node' ? nodeTypes : edgeTypes;
        return types[entityType]?.name ?? null;
      },
    );
    const qualifier = resolveStageQualifier(
      { type, panels, items, nominationPrompts },
      {
        resolveAssetType: (assetId) => assetManifest[assetId]?.type ?? null,
        resolveVariableName: (variableId) =>
          variablesByUuid[variableId]?.name ?? null,
      },
    );
    const existingLabels = stageList
      .map((stage) => stage.label)
      .filter((stageLabel): stageLabel is string => Boolean(stageLabel));
    return generateStageLabel({
      typeName: STAGE_TYPE_NAMES[type],
      subjectName,
      qualifier,
      existingLabels,
    });
  }, [
    type,
    subject,
    panels,
    items,
    nominationPrompts,
    nodeTypes,
    edgeTypes,
    codebook,
    assetManifest,
    stageList,
  ]);

  const isCustomRef = useRef(false);
  const lastGeneratedRef = useRef<string | undefined>(undefined);
  const hasFilledRef = useRef(false);

  const restoreVersion = useStageRestoreVersion();
  const lastRestoreVersionRef = useRef(restoreVersion);

  // Kept current each render so the stable blur handler reads the latest values.
  const liveLabelRef = useRef(liveLabel);
  liveLabelRef.current = liveLabel;
  const generatedLabelRef = useRef(generatedLabel);
  generatedLabelRef.current = generatedLabel;

  const applyLabel = useCallback(
    (nextLabel: string) => {
      const isInitialFill = !hasFilledRef.current;
      hasFilledRef.current = true;
      lastGeneratedRef.current = nextLabel;
      setStageValue('label', nextLabel);
      // Fold the very first auto-name into the draft baseline so a brand-new
      // stage isn't reported dirty (no "Finished Editing" flash) and gains no
      // undo step before the researcher has done anything. Cancelling the
      // bridge's armed debounce drops the snapshot this write would otherwise
      // have produced.
      if (isInitialFill) {
        draft.cancelPendingSnapshot();
        const fresh = storeApi.getState().getFormValues() as unknown as Stage;
        // Re-baselines the STAGE only. The codebook half is left alone in
        // both directions: a codebook edit cannot be laundered into the
        // opening state, and a variable created so far cannot be reverted out
        // from under the form that references it.
        dispatch(rebaselineDraftStage(fresh));
      }
    },
    [dispatch, draft, setStageValue, storeApi],
  );

  useEffect(() => {
    // An undo/redo rewrites the label as a *restore*, not a user edit, and the
    // restore commit always carries a new restore version. Without this guard
    // the classification below would compare the restored label against the
    // newest generated name, read the mismatch as the researcher taking
    // ownership, and silently kill auto-naming for the rest of the session.
    // Skipping the run alone is not enough: `lastGeneratedRef` would still
    // hold the pre-restore name, so the very next run would latch anyway —
    // the ref has to be resynced to the restored label.
    //
    // Ownership follows WHERE the restore lands, in both directions:
    // - While custom, a restore back ON the last generated name is the
    //   researcher undoing their rename — auto-naming re-arms, so undo
    //   restores the prior *behaviour*, not just the prior text. A restore to
    //   any other text (their hand-typed name, or between two hand-typed
    //   names) keeps their ownership.
    // - While auto, the resync must be CONDITIONAL on the restored label
    //   actually being a generated one (the current candidate or the last
    //   generated name). A redo landing back on the hand-typed name must NOT
    //   resync — doing so would make the researcher's text read as generated,
    //   and the next config change would overwrite it. Left un-resynced, the
    //   next ordinary run's classifier reads the mismatch and re-takes
    //   ownership, and `lastGeneratedRef` still matches if they undo again.
    if (lastRestoreVersionRef.current !== restoreVersion) {
      lastRestoreVersionRef.current = restoreVersion;
      if (isCustomRef.current) {
        if (liveLabel === lastGeneratedRef.current) {
          isCustomRef.current = false;
        }
      } else if (
        liveLabel === generatedLabel ||
        liveLabel === lastGeneratedRef.current
      ) {
        lastGeneratedRef.current = liveLabel;
      }
      return;
    }

    const update = computeAutoNameUpdate({
      isNewStage,
      isCustom: isCustomRef.current,
      liveLabel,
      lastGenerated: lastGeneratedRef.current,
      generatedLabel,
    });
    isCustomRef.current = update.nextIsCustom;
    if (update.label !== undefined) {
      applyLabel(update.label);
    }
  }, [generatedLabel, liveLabel, isNewStage, applyLabel, restoreVersion]);

  // Re-engage on blur: if the researcher cleared the name and tabs away while it
  // is still empty, fill the generated name back in (rather than fighting their
  // keystrokes the instant the field goes empty).
  const onLabelBlur = useCallback(() => {
    if (!isNewStage) {
      return;
    }
    if (liveLabelRef.current.trim() === '' && generatedLabelRef.current) {
      isCustomRef.current = false;
      applyLabel(generatedLabelRef.current);
    }
  }, [isNewStage, applyLabel]);

  return { onLabelBlur };
}
