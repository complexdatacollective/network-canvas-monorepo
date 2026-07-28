import { useCallback } from 'react';
import { useSelector } from 'react-redux';
import {
  change,
  formValueSelector,
  getFormInitialValues,
  SubmissionError,
} from 'redux-form';

import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Section } from '~/components/EditorLayout';
import DialogArrayField from '~/components/Form/DialogArrayField';
import ValidatedFieldArray from '~/components/Form/ValidatedFieldArray';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import {
  crossClassPickIssue,
  validatedElsewhereMessage,
} from '~/components/Validations/contradictions';
import { useAppDispatch } from '~/ducks/hooks';
import type { RootState } from '~/ducks/store';
import { EMPTY_VARIABLES, getVariablesForSubject } from '~/selectors/codebook';
import { getVariableRoleMap, roleMapKey } from '~/selectors/indexes';

import NominationPromptFields from './NominationPromptFields';
import NominationPromptPreview from './NominationPromptPreview';

// The shared row-editor form name every DialogArrayField editor requests
// (see this file's own `requestedEditFormName`) — only one editor dialog is
// ever open at a time, so this is safe to read unqualified.
const EDIT_FORM_NAME = 'editable-list-form';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const notEmpty = (value: unknown) =>
  value && Array.isArray(value) && value.length > 0
    ? undefined
    : 'You must create at least one item.';
const NominationPrompts = ({ form }: StageEditorSectionProps) => {
  const dispatch = useAppDispatch();
  const { confirm } = useDialog();
  const getFormValue = formValueSelector(form);
  const nodeType = useSelector(
    (state: RootState) =>
      getFormValue(state, 'nodeConfig.type') as string | undefined,
  );
  const hasNominationPrompts = useSelector(
    (state: RootState) =>
      getFormValue(state, 'nominationPrompts') as unknown[] | undefined,
  );
  const allVariables = useSelector((state: RootState) =>
    nodeType
      ? getVariablesForSubject(state, { entity: 'node', type: nodeType })
      : EMPTY_VARIABLES,
  );
  const roleMap = useSelector(getVariableRoleMap);
  const originalVariable = useSelector((state: RootState) => {
    const initial = getFormInitialValues(EDIT_FORM_NAME)(state);
    return isRecord(initial) && typeof initial.variable === 'string'
      ? initial.variable
      : '';
  });
  // Cross-class exclusivity gate: the nomination toggle is an UNVALIDATED
  // writer, so its variable may not be one a form elsewhere already collects
  // (the save-time backstop for a stale draft that bypassed the picker
  // exclusion — see NominationPromptFields.tsx's excludeValidatedUses call).
  // `variable` is a plain field on the prompt form (NominationPromptFields.tsx's
  // ValidatedField name="variable"), so a STRING value renders correctly.
  const onBeforeSave = useCallback(
    (value: unknown) => {
      if (!nodeType || !isRecord(value)) return value;
      const subject = { entity: 'node' as const, type: nodeType };
      const variable = typeof value.variable === 'string' ? value.variable : '';
      const issue = crossClassPickIssue({
        variableId: variable,
        originalVariableId: originalVariable,
        hasConflictingUse: (variableId) =>
          (roleMap[roleMapKey(subject, variableId)]?.validated ?? 0) > 0,
        allVariables,
        message: validatedElsewhereMessage,
      });
      if (issue) {
        throw new SubmissionError({ variable: issue });
      }
      return value;
    },
    [nodeType, roleMap, allVariables, originalVariable],
  );
  const isDisabled = !nodeType;
  const handleToggleChange = useCallback(
    async (newState: boolean) => {
      if (!hasNominationPrompts?.length || newState) {
        return true;
      }
      const confirmed = await confirm({
        title: 'This will clear your nomination prompts',
        description:
          'This will clear your nomination prompts and delete any prompts you have created. Do you want to continue?',
        confirmLabel: 'Clear prompts',
        cancelLabel: 'Cancel',
        intent: 'warning',
        onConfirm: () => {},
      });
      if (confirmed) {
        dispatch(change(form, 'nominationPrompts', null));
        return true;
      }
      return false;
    },
    [confirm, dispatch, form, hasNominationPrompts],
  );
  return (
    <Section
      disabled={isDisabled}
      summary={
        <Paragraph>
          Optionally add prompts to collect attribute information about family
          members. Each prompt should ask about a specific condition or trait
          and will store the response in the selected boolean variable.
        </Paragraph>
      }
      title="Nomination Prompts"
      toggleable
      startExpanded={!!hasNominationPrompts?.length}
      handleToggleChange={handleToggleChange}
    >
      <ValidatedFieldArray
        name="nominationPrompts"
        label="Nomination prompts"
        labelHidden
        component={DialogArrayField}
        validation={{ notEmpty }}
        componentProps={{
          addTitle: 'Edit Prompt',
          previewComponent: NominationPromptPreview,
          editorFieldsComponent: NominationPromptFields,
          editorTitle: 'Edit Prompt',
          editorProps: { nodeType },
          itemLabel: 'prompt',
          onBeforeSave,
          sortable: true,
          requestedEditFormName: 'editable-list-form',
          emptyStateMessage:
            'No nomination prompts have been created yet. Click "Create new" to add your first prompt.',
        }}
      />
    </Section>
  );
};
export default NominationPrompts;
