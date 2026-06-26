import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';
import type { Action, Dispatch } from 'redux';
import { change, getFormValues } from 'redux-form';

import type {
  Item,
  Panel,
  Stage,
  StageSubject,
  StageType,
} from '@codaco/protocol-validation';
import { draftTimelineActions } from '~/ducks/modules/stageEditorDraft';
import type { RootState } from '~/ducks/store';
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

import { formName } from '../configuration';
import { computeAutoNameUpdate } from './computeAutoNameUpdate';
import { generateStageLabel, STAGE_TYPE_NAMES } from './generateStageLabel';
import {
  resolveStageQualifier,
  resolveStageSubjectName,
} from './resolveStageNameParts';

type StageFormValues = {
  type?: StageType;
  label?: string;
  subject?: StageSubject;
  panels?: Panel[];
  items?: Item[];
  nominationPrompts?: { variable: string }[];
};

export function useAutoStageName(isNewStage: boolean): {
  onLabelBlur: () => void;
} {
  const dispatch = useDispatch<Dispatch<Action>>();
  const store = useStore<RootState>();
  const formValues = useSelector(getFormValues(formName)) as
    | StageFormValues
    | undefined;
  const nodeTypes = useSelector(getNodeTypes);
  const edgeTypes = useSelector(getEdgeTypes);
  const codebook = useSelector(getCodebook);
  const assetManifest = useSelector(getAssetManifest);
  const stageList = useSelector(getStageList);

  const liveLabel = formValues?.label ?? '';

  const generatedLabel = useMemo(() => {
    const type = formValues?.type;
    if (!type) {
      return '';
    }
    const variablesByUuid = codebook ? getAllVariablesByUUID(codebook) : {};
    const subjectName = resolveStageSubjectName(
      formValues?.subject,
      (entity, entityType) => {
        const types = entity === 'node' ? nodeTypes : edgeTypes;
        return types[entityType]?.name ?? null;
      },
    );
    const qualifier = resolveStageQualifier(
      {
        type,
        panels: formValues?.panels,
        items: formValues?.items,
        nominationPrompts: formValues?.nominationPrompts,
      },
      {
        resolveAssetType: (assetId) => assetManifest[assetId]?.type ?? null,
        resolveVariableName: (variableId) =>
          variablesByUuid[variableId]?.name ?? null,
      },
    );
    const existingLabels = stageList
      .map((stage) => stage.label)
      .filter((label): label is string => Boolean(label));
    return generateStageLabel({
      typeName: STAGE_TYPE_NAMES[type],
      subjectName,
      qualifier,
      existingLabels,
    });
  }, [formValues, nodeTypes, edgeTypes, codebook, assetManifest, stageList]);

  const isCustomRef = useRef(false);
  const lastGeneratedRef = useRef<string | undefined>(undefined);
  const hasFilledRef = useRef(false);

  // Kept current each render so the stable blur handler reads the latest values.
  const liveLabelRef = useRef(liveLabel);
  liveLabelRef.current = liveLabel;
  const generatedLabelRef = useRef(generatedLabel);
  generatedLabelRef.current = generatedLabel;

  const applyLabel = useCallback(
    (label: string) => {
      const isInitialFill = !hasFilledRef.current;
      hasFilledRef.current = true;
      lastGeneratedRef.current = label;
      dispatch(change(formName, 'label', label));
      // Fold the very first auto-name into the draft baseline so a brand-new
      // stage isn't reported dirty (no "Finished Editing" flash) and gains no
      // undo step before the researcher has done anything. The reset also clears
      // the listener's pending snapshot for this change.
      if (isInitialFill) {
        const fresh = getFormValues(formName)(store.getState()) as
          | Stage
          | undefined;
        if (fresh) {
          dispatch(draftTimelineActions.reset(fresh));
        }
      }
    },
    [dispatch, store],
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
