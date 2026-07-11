import { useCallback } from 'react';
import { useSelector } from 'react-redux';
import { change, formValueSelector } from 'redux-form';

import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Section } from '~/components/EditorLayout';
import DialogArrayField from '~/components/Form/DialogArrayField';
import ValidatedFieldArray from '~/components/Form/ValidatedFieldArray';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import { useAppDispatch } from '~/ducks/hooks';
import type { RootState } from '~/ducks/store';

import NominationPromptFields from './NominationPromptFields';
import NominationPromptPreview from './NominationPromptPreview';
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
        component={DialogArrayField}
        validation={{ notEmpty }}
        componentProps={{
          addTitle: 'Edit Prompt',
          previewComponent: NominationPromptPreview,
          editorFieldsComponent: NominationPromptFields,
          editorTitle: 'Edit Prompt',
          editorProps: { nodeType },
          itemLabel: 'prompt',
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
