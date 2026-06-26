import { useEffect, useMemo, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { change, getFormValues } from 'redux-form';

import type {
  Item,
  Panel,
  StageSubject,
  StageType,
  Variables,
} from '@codaco/protocol-validation';
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

export function useAutoStageName(isNewStage: boolean): void {
  const dispatch = useDispatch();
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
    const variablesByUuid: Variables = codebook
      ? getAllVariablesByUUID(codebook)
      : {};
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
      lastGeneratedRef.current = update.label;
      dispatch(change(formName, 'label', update.label));
    }
  }, [generatedLabel, liveLabel, isNewStage, dispatch]);
}
