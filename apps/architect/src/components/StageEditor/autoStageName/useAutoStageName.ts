import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSelector } from 'react-redux';

import type {
  Item,
  Stage,
  StageSubject,
  StageType,
} from '@codaco/protocol-validation';
import { usePanelsForAutoName } from '~/components/sections/NodePanels/panelSlots';
import { useAppDispatch } from '~/ducks/hooks';
import { draftTimelineActions } from '~/ducks/modules/stageEditorDraft';
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

import { useStageFormContext } from '../stageFormContext';
import { useSetStageValue, useStageFormValue } from '../stageFormHooks';
import { computeAutoNameUpdate } from './computeAutoNameUpdate';
import { generateStageLabel, STAGE_TYPE_NAMES } from './generateStageLabel';
import {
  resolveStageQualifier,
  resolveStageSubjectName,
} from './resolveStageNameParts';

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
        dispatch(draftTimelineActions.reset(fresh));
      }
    },
    [dispatch, draft, setStageValue, storeApi],
  );

  useEffect(() => {
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
  }, [generatedLabel, liveLabel, isNewStage, applyLabel]);

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
